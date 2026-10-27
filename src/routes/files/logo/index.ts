import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { createDb } from '#/db'
import { readLogo } from '#/server/settings'

export const Route = createFileRoute('/files/logo/')({
  server: {
    handlers: {
      GET: ({ request }) => readLogo(createDb(env.DB), env.FILES, request),
    },
  },
})
