import handler from '@tanstack/react-start/server-entry'
import { createApi } from '#/api/app'
import { runDailyJobs } from '#/jobs/daily'

const api = createApi()

export default {
  fetch(request, env, ctx) {
    const { pathname } = new URL(request.url)
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return api.fetch(request, env, ctx)
    }
    return handler.fetch(request)
  },

  async scheduled(event, env, ctx) {
    console.log(`scheduled: ${event.cron}`)
    ctx.waitUntil(runDailyJobs(env))
  },
} satisfies ExportedHandler<Env>
