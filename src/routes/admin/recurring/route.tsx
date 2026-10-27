import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/recurring')({
  staticData: { breadcrumb: 'Recurring' },
  component: Outlet,
})
