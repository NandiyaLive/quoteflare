import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/leads')({
  staticData: { breadcrumb: 'Leads' },
  component: Outlet,
})
