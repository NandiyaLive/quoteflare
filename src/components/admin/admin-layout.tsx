import { Outlet } from '@tanstack/react-router'
import ThemeToggle from '@/components/common/theme-toggle'
import { AdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

export function AdminLayout({ email }: { email: string }) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AdminSidebar email={email} />
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
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
              <Outlet />
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
