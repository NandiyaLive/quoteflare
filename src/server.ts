import handler from '@tanstack/react-start/server-entry'

export default {
  fetch(request) {
    return handler.fetch(request)
  },

  async scheduled(event) {
    console.log(`scheduled: ${event.cron}`)
  },
} satisfies ExportedHandler<Env>
