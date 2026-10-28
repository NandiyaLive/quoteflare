import handler from '@tanstack/react-start/server-entry'
import { createApi } from '#/api/app'
import { runDailyJobs } from '#/jobs/daily'
import { ROBOTS_TXT } from '#/lib/robots'
import { isRateLimited, tooManyRequests } from '#/server/rate-limit'

const api = createApi()

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'

// The framework emits inline hydration scripts, so script-src needs
// 'unsafe-inline'. The other directives still block framing, plugins, base tag
// injection and form posts to other sites.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${TURNSTILE_ORIGIN}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  `frame-src ${TURNSTILE_ORIGIN}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  // Invoice links carry a secret token in the path, so never send it onward.
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

const withSecurityHeaders = (response: Response) => {
  const secured = new Response(response.body, response)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!secured.headers.has(name)) secured.headers.set(name, value)
  }
  return secured
}

const serverError = () =>
  new Response('Something went wrong.', {
    status: 500,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url)
    if (pathname === '/robots.txt') {
      return new Response(ROBOTS_TXT, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }
    if (
      request.method === 'POST' &&
      pathname === '/api/public/quote' &&
      (await isRateLimited(env.QUOTE_LIMITER, request))
    ) {
      return tooManyRequests()
    }
    if (
      pathname.startsWith('/i/') &&
      (await isRateLimited(env.INVOICE_LIMITER, request))
    ) {
      return withSecurityHeaders(tooManyRequests())
    }
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return api.fetch(request, env, ctx)
    }
    try {
      return withSecurityHeaders(await handler.fetch(request))
    } catch (error) {
      console.error('request failed', error)
      return withSecurityHeaders(serverError())
    }
  },

  async scheduled(event, env, ctx) {
    console.log(`scheduled: ${event.cron}`)
    ctx.waitUntil(runDailyJobs(env))
  },
} satisfies ExportedHandler<Env>
