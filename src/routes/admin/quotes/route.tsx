import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/quotes')({
  staticData: { breadcrumb: 'Quotes' },
  component: Outlet,
})
