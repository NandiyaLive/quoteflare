import { Link, useMatchRoute } from '@tanstack/react-router'
import {
  GlobeIcon,
  RepeatIcon,
  InboxIcon,
  ReceiptTextIcon,
  LayoutDashboardIcon,
  LayersIcon,
  PackageIcon,
  UsersIcon,
  SettingsIcon,
  type LucideIcon,
} from 'lucide-react'
import Logo from '@/components/common/logo'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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

export function AdminSidebar({ email }: { email: string }) {
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
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip={email}
              className="cursor-default"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">
                  {email.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Administrator</span>
                <span className="truncate text-xs">{email}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
