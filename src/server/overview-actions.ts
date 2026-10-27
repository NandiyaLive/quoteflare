import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { createDb } from '#/db'
import { requireAdmin } from './admin-middleware'
import { loadOverview } from './overview'

export const getOverview = createServerFn()
  .middleware([requireAdmin])
  .handler(() =>
    loadOverview(createDb(env.DB), new Date().toISOString().slice(0, 10)),
  )
