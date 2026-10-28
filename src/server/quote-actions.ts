import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
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
import { z } from 'zod'
import { requireAdmin } from './admin-middleware'
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
import { verifyTurnstile } from './turnstile'

export const getQuoteConfig = createServerFn().handler(() => ({
  turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? '',
}))

export const submitQuoteAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .handler(async ({ data }): Promise<SubmitQuoteResult> => {
    const length = Number(getRequestHeader('content-length') ?? 0)
    if (length > MAX_PUBLIC_BODY_BYTES) {
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
    return submitQuote(createDb(env.DB), parsed.data, () =>
      verifyTurnstile(env.TURNSTILE_SECRET, parsed.data.turnstileToken, ip),
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
      new Date().toISOString().slice(0, 10),
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
      new Date().toISOString().slice(0, 10),
    ),
  )
