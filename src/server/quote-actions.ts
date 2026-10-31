import { createServerFn } from '@tanstack/react-start'
import {
  getRequest,
  getRequestHeader,
  getRequestUrl,
} from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { createDb } from '#/db'
import { recurringIntervals } from '#/db/schema'
import {
  bulkDismissSchema,
  convertQuoteSchema,
  MAX_PUBLIC_BODY_BYTES,
  quoteFilterSchema,
  quoteEditSchema,
  quoteRequestSchema,
  quoteResponseSchema,
  quoteStatusUpdateSchema,
  sendQuoteSchema,
} from '#/lib/quotes'
import { toIsoDate } from '#/lib/invoices'
import { z } from 'zod'
import { requireAdmin } from './admin-middleware'
import { isRateLimited, tooManyRequests } from './rate-limit'
import {
  convertQuoteToInvoice,
  dismissQuotes,
  getQuote,
  getQuoteInvoice,
  getPublicQuote,
  getQuoteSchedulePrefill,
  listQuoteEvents,
  listQuotes,
  saveQuoteEdit,
  respondToQuote,
  setQuoteStatus,
  submitQuote,
  type SubmitQuoteResult,
} from './quotes'
import {
  sendQuoteEmails,
  sendQuoteResponseEmail,
  sendQuoteToClient,
} from './quote-email'
import { verifyTurnstile } from './turnstile'

export const getQuoteConfig = createServerFn().handler(() => ({
  turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? '',
}))

// The framework parses the body before the handler runs, so measure what it
// produced. A Content-Length check misses chunked requests.
const jsonByteLength = (value: unknown) => {
  try {
    return new TextEncoder().encode(JSON.stringify(value) ?? '').byteLength
  } catch {
    return Infinity
  }
}

export const submitQuoteAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .handler(async ({ data }): Promise<SubmitQuoteResult> => {
    // server.ts limits /api/public/quote. The site's own form calls this
    // server function instead, so it shares the same limit here.
    if (await isRateLimited(env.QUOTE_LIMITER, getRequest())) {
      return {
        ok: false,
        error: 'Too many quote requests. Try again in a minute.',
      }
    }
    if (jsonByteLength(data) > MAX_PUBLIC_BODY_BYTES) {
      return { ok: false, error: 'The request is too large.' }
    }
    const parsed = quoteRequestSchema.safeParse(data)
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'The request is invalid.',
      }
    }
    const ip = getRequestHeader('cf-connecting-ip')
    const db = createDb(env.DB)
    return submitQuote(
      db,
      parsed.data,
      () =>
        verifyTurnstile(env.TURNSTILE_SECRET, parsed.data.turnstileToken, ip),
      (id) =>
        sendQuoteEmails(
          db,
          {
            apiKey: env.RESEND_API_KEY,
            from: env.EMAIL_FROM,
            origin: env.APP_ORIGIN || getRequestUrl().origin,
          },
          id,
        ),
    )
  })

export const getQuotes = createServerFn()
  .validator((input: unknown) => quoteFilterSchema.parse(input))
  .middleware([requireAdmin])
  .handler(({ data }) => listQuotes(createDb(env.DB), data.status))

export const getQuoteDetail = createServerFn()
  .validator((input: unknown) => String(input))
  .middleware([requireAdmin])
  .handler(async ({ data }) => {
    const db = createDb(env.DB)
    const quote = await getQuote(db, data)
    if (!quote) return null
    return {
      quote,
      invoice: (await getQuoteInvoice(db, data)) ?? null,
      events: await listQuoteEvents(db, data),
      fallbackTaxRateBps:
        (await db.query.settings.findFirst())?.taxRateBps ?? 0,
    }
  })

export const setQuoteStatusAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => quoteStatusUpdateSchema.parse(input))
  .middleware([requireAdmin])
  .handler(async ({ data }) => ({
    ok: await setQuoteStatus(createDb(env.DB), data.id, data.status),
  }))

export const convertQuoteAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => convertQuoteSchema.parse(input))
  .middleware([requireAdmin])
  .handler(({ data }) =>
    convertQuoteToInvoice(
      createDb(env.DB),
      data.id,
      data.today,
      data.advancePercent,
    ),
  )

const quoteSchedulePrefillSchema = z.strictObject({
  quoteId: z.string().min(1).max(64),
  interval: z.enum(recurringIntervals),
})

export const getQuoteSchedulePrefillAction = createServerFn()
  .validator((input: unknown) => quoteSchedulePrefillSchema.parse(input))
  .middleware([requireAdmin])
  .handler(({ data }) =>
    getQuoteSchedulePrefill(
      createDb(env.DB),
      data.quoteId,
      data.interval,
      toIsoDate(new Date()),
    ),
  )

export const sendQuoteAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => sendQuoteSchema.parse(input))
  .middleware([requireAdmin])
  .handler(({ data }) =>
    sendQuoteToClient(
      createDb(env.DB),
      {
        apiKey: env.RESEND_API_KEY,
        from: env.EMAIL_FROM,
        origin: env.APP_ORIGIN || getRequestUrl().origin,
      },
      data.id,
    ),
  )

// server.ts limits page loads of /q/<token>, and rendering that page calls this
// function inside the same request. Client-side navigation and the accept and
// decline buttons call the server function endpoint, so only those count here.
const limitPublicCall = async () => {
  const request = getRequest()
  if (
    !new URL(request.url).pathname.startsWith('/q/') &&
    (await isRateLimited(env.INVOICE_LIMITER, request))
  ) {
    throw tooManyRequests()
  }
}

export const getPublicQuoteAction = createServerFn()
  .validator((input: unknown) => String(input).slice(0, 64))
  .handler(async ({ data }) => {
    await limitPublicCall()
    return getPublicQuote(createDb(env.DB), data, toIsoDate(new Date()))
  })

export const respondToQuoteAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => quoteResponseSchema.parse(input))
  .handler(async ({ data }) => {
    await limitPublicCall()
    const db = createDb(env.DB)
    const result = await respondToQuote(
      db,
      data.token,
      data.response,
      toIsoDate(new Date()),
    )
    if (result.ok) {
      await sendQuoteResponseEmail(
        db,
        {
          apiKey: env.RESEND_API_KEY,
          from: env.EMAIL_FROM,
          origin: env.APP_ORIGIN || getRequestUrl().origin,
        },
        result.id,
      )
    }
    return result
  })

export const saveQuoteEditAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => quoteEditSchema.parse(input))
  .middleware([requireAdmin])
  .handler(({ data }) => saveQuoteEdit(createDb(env.DB), data))

export const dismissQuotesAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => bulkDismissSchema.parse(input))
  .middleware([requireAdmin])
  .handler(async ({ data }) => ({
    dismissed: await dismissQuotes(createDb(env.DB), data.ids),
  }))
