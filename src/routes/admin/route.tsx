import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { AdminLayout } from '@/components/admin/admin-layout'
import '#/lib/breadcrumbs'
import { requireAdmin } from '#/server/admin-middleware'

const getAdminIdentity = createServerFn()
  .middleware([requireAdmin])
  .handler(({ context }) => context.admin)

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => ({ admin: await getAdminIdentity() }),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  staticData: { breadcrumb: 'Admin' },
  component: AdminRoute,
})

function AdminRoute() {
  const { admin } = Route.useRouteContext()
  return <AdminLayout email={admin.email} />
}
