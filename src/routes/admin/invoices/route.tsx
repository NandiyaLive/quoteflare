import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/invoices')({
  staticData: { breadcrumb: 'Invoices' },
  component: Outlet,
})
