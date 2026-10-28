import '#/lib/breadcrumbs'
import { requireAdmin } from '#/server/admin-middleware'
import { AdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import ThemeToggle from '@/components/common/theme-toggle'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

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
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AdminSidebar />
        <SidebarInset className="min-w-0">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <AdminBreadcrumbs />
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </header>
          <div className="flex flex-1 flex-col p-4 md:p-6 lg:p-8">
            <div className="flex w-full min-w-0 flex-col gap-8">
              <Outlet />
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
