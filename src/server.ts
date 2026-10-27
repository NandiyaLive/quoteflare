import handler from '@tanstack/react-start/server-entry'
import { runDailyJobs } from '#/jobs/daily'

export default {
  fetch(request) {
    return handler.fetch(request)
  },

  async scheduled(event, env, ctx) {
    console.log(`scheduled: ${event.cron}`)
    ctx.waitUntil(runDailyJobs(env))
  },
} satisfies ExportedHandler<Env>
