import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { createDb } from '#/db'
import { MAX_PUBLIC_BODY_BYTES, quoteRequestSchema } from '#/lib/quotes'
import { loadCalculatorCatalog } from '#/server/calculator'
import { sendQuoteEmails } from '#/server/quote-email'
import { submitQuote } from '#/server/quotes'
import { verifyTurnstile } from '#/server/turnstile'
import { applyEmailEvent } from './email-events'
import { verifyWebhookSignature } from './webhook-signature'

type Deps = { fetcher?: typeof fetch }

const parseAllowedOrigins = (value: string | undefined) =>
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

  const tooLarge = bodyLimit({
    maxSize: MAX_PUBLIC_BODY_BYTES,
    onError: (c) => c.json({ ok: false, error: 'The body is too large.' }, 413),
  })
  app.use('/public/*', tooLarge)
  app.use('/webhooks/*', tooLarge)

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
    const db = createDb(c.env.DB)
    const result = await submitQuote(
      db,
      parsed.data,
      () =>
        verifyTurnstile(
          c.env.TURNSTILE_SECRET,
          parsed.data.turnstileToken,
          ip,
          fetcher,
        ),
      (id) =>
        sendQuoteEmails(
          db,
          {
            apiKey: c.env.RESEND_API_KEY,
            from: c.env.EMAIL_FROM,
            origin: c.env.APP_ORIGIN || new URL(c.req.url).origin,
            fetcher,
          },
          id,
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
