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
  convertQuoteSchema,
  MAX_PUBLIC_BODY_BYTES,
  quoteFilterSchema,
  quoteRequestSchema,
  quoteStatusUpdateSchema,
} from '#/lib/quotes'
import { toIsoDate } from '#/lib/invoices'
import { z } from 'zod'
import { requireAdmin } from './admin-middleware'
import { isRateLimited } from './rate-limit'
import {
  convertQuoteToInvoice,
  getQuote,
  getQuoteInvoice,
  getQuoteSchedulePrefill,
  listQuotes,
  setQuoteStatus,
  submitQuote,
  type SubmitQuoteResult,
} from './quotes'
import { sendQuoteEmails } from './quote-email'
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
    return { quote, invoice: (await getQuoteInvoice(db, data)) ?? null }
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
