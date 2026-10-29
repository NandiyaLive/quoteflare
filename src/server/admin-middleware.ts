import { createMiddleware } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { authenticateAdmin } from './access'

const unauthorized = () =>
  new Response('Unauthorized', {
    status: 401,
    headers: { 'Cache-Control': 'no-store' },
  })

const authenticate = (request: Request) =>
  authenticateAdmin(request, {
    teamDomain: env.ACCESS_TEAM_DOMAIN,
    audience: env.ACCESS_AUD,
    devEmail: env.ACCESS_DEV_EMAIL,
    dev: env.DEV,
  })

export const requireAdmin = createMiddleware({ type: 'request' }).server(
  async ({ request, next }) => {
    const admin = await authenticate(request)
    if (!admin) return unauthorized()
    return next({ context: { admin } })
  },
)

export const guardAdminPaths = createMiddleware({ type: 'request' }).server(
  async ({ request, pathname, next }) => {
    if (pathname !== '/admin' && !pathname.startsWith('/admin/')) return next()
    const admin = await authenticate(request)
    if (!admin) return unauthorized()
    return next({ context: { admin } })
  },
)
