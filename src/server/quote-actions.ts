import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { createDb } from '#/db'
import {
  quoteFilterSchema,
  quoteRequestSchema,
  quoteStatusUpdateSchema,
} from '#/lib/quotes'
import { requireAdmin } from './admin-middleware'
import {
  getQuote,
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
    return (await getQuote(db, data)) ?? null
  })

export const setQuoteStatusAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => quoteStatusUpdateSchema.parse(input))
  .middleware([requireAdmin])
  .handler(async ({ data }) => ({
    ok: await setQuoteStatus(createDb(env.DB), data.id, data.status),
  }))
