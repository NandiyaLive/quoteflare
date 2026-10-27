import handler from '@tanstack/react-start/server-entry'
import { createApi } from '#/api/app'
import { runDailyJobs } from '#/jobs/daily'
import { ROBOTS_TXT } from '#/lib/robots'

const api = createApi()

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
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return api.fetch(request, env, ctx)
    }
    try {
      return await handler.fetch(request)
    } catch (error) {
      console.error('request failed', error)
      return serverError()
    }
  },

  async scheduled(event, env, ctx) {
    console.log(`scheduled: ${event.cron}`)
    ctx.waitUntil(runDailyJobs(env))
  },
} satisfies ExportedHandler<Env>
