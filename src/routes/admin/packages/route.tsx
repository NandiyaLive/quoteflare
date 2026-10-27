import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/packages')({
  staticData: { breadcrumb: 'Packages' },
  component: Outlet,
})
