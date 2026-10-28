import Logo from '@/components/common/logo'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { Link, useMatchRoute } from '@tanstack/react-router'
import {
  GlobeIcon,
  InboxIcon,
  LayersIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  PackageIcon,
  ReceiptTextIcon,
  RepeatIcon,
  SettingsIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'

type NavItem = {
  title: string
  to:
    | '/admin'
    | '/admin/clients'
    | '/admin/invoices'
    | '/admin/packages'
    | '/admin/quotes'
    | '/admin/recurring'
    | '/admin/services'
    | '/admin/settings'
  icon: LucideIcon
  exact?: boolean
}

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      {
        title: 'Dashboard',
        to: '/admin',
        icon: LayoutDashboardIcon,
        exact: true,
      },
      { title: 'Quotes', to: '/admin/quotes', icon: InboxIcon },
      { title: 'Invoices', to: '/admin/invoices', icon: ReceiptTextIcon },
      { title: 'Recurring', to: '/admin/recurring', icon: RepeatIcon },
      { title: 'Clients', to: '/admin/clients', icon: UsersIcon },
    ],
  },
  {
    label: 'Configure',
    items: [
      { title: 'Services', to: '/admin/services', icon: PackageIcon },
      { title: 'Packages', to: '/admin/packages', icon: LayersIcon },
      { title: 'Settings', to: '/admin/settings', icon: SettingsIcon },
    ],
  },
]

// Cloudflare Access serves this path on every host it protects. It clears the
// CF_Authorization cookie and ends the Access session. Local dev has no Access.
const LOGOUT_URL = '/cdn-cgi/access/logout'

export function AdminSidebar() {
  const matchRoute = useMatchRoute()
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex h-12 items-center px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <Logo
                variant="mark"
                role="img"
                aria-label="Quoteflare"
                className="h-auto w-8 shrink-0 group-data-[collapsible=icon]:w-4"
              />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="View public site"
                  render={
                    <Link
                      to="/"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => isMobile && setOpenMobile(false)}
                    />
                  }
                >
                  <GlobeIcon />
                  <span>View public site</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={Boolean(
                        matchRoute({ to: item.to, fuzzy: !item.exact }),
                      )}
                      render={
                        <Link
                          to={item.to}
                          onClick={() => isMobile && setOpenMobile(false)}
                        />
                      }
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {!import.meta.env.DEV && (
            <SidebarMenuItem>
              <SidebarMenuButton
                variant="destructive"
                tooltip="Log out"
                render={<a href={LOGOUT_URL} />}
              >
                <LogOutIcon />
                <span>Log out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
