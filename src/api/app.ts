import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createDb } from '#/db'
import { quoteRequestSchema } from '#/lib/quotes'
import { loadCalculatorCatalog } from '#/server/calculator'
import { submitQuote } from '#/server/quotes'
import { verifyTurnstile } from '#/server/turnstile'
import { applyEmailEvent } from './email-events'
import { verifyWebhookSignature } from './webhook-signature'

type Deps = { fetcher?: typeof fetch }

export const parseAllowedOrigins = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)

export function createApi({ fetcher = fetch }: Deps = {}) {
  const app = new Hono<{ Bindings: Env }>().basePath('/api')

  app.use(
    '/public/*',
    cors({
      origin: (origin, c) =>
        parseAllowedOrigins(c.env.ALLOWED_ORIGINS).includes(origin)
          ? origin
          : '',
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      maxAge: 86400,
    }),
  )

  app.post('/webhooks/resend', async (c) => {
    const body = await c.req.text()
    const valid = await verifyWebhookSignature(
      c.env.RESEND_WEBHOOK_SECRET,
      {
        id: c.req.header('svix-id') ?? null,
        timestamp: c.req.header('svix-timestamp') ?? null,
        signature: c.req.header('svix-signature') ?? null,
      },
      body,
    )
    if (!valid) return c.json({ error: 'Invalid signature.' }, 401)

    let payload: unknown
    try {
      payload = JSON.parse(body)
    } catch {
      return c.json({ error: 'The body is not valid JSON.' }, 400)
    }
    const result = await applyEmailEvent(createDb(c.env.DB), payload)
    return c.json({ result })
  })

  app.get('/public/services', async (c) => {
    const catalog = await loadCalculatorCatalog(createDb(c.env.DB))
    return c.json(catalog, 200, { 'Cache-Control': 'no-store' })
  })

  app.post('/public/quote', async (c) => {
    let input: unknown
    try {
      input = await c.req.json()
    } catch {
      return c.json({ ok: false, error: 'The body is not valid JSON.' }, 400)
    }
    const parsed = quoteRequestSchema.safeParse(input)
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: parsed.error.issues[0]?.message ?? 'The request is invalid.',
        },
        400,
      )
    }
    const ip = c.req.header('cf-connecting-ip')
    const result = await submitQuote(createDb(c.env.DB), parsed.data, () =>
      verifyTurnstile(
        c.env.TURNSTILE_SECRET,
        parsed.data.turnstileToken,
        ip,
        fetcher,
      ),
    )
    return c.json(result, result.ok ? 201 : 400)
  })

  app.notFound((c) => c.json({ error: 'Not found.' }, 404))
  app.onError((error, c) => {
    console.error('api error', error)
    return c.json({ error: 'Something went wrong.' }, 500)
  })

  return app
}
