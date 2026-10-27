import { Outlet, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { requireAdmin } from '#/server/admin-middleware'

const getAdminIdentity = createServerFn()
  .middleware([requireAdmin])
  .handler(({ context }) => context.admin)

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => ({ admin: await getAdminIdentity() }),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: Outlet,
})
