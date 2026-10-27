import { createFileRoute } from '@tanstack/react-router'
import PageHeader from '@/components/common/page-header'

export const Route = createFileRoute('/admin/')({
  component: AdminHome,
})

function AdminHome() {
  const { admin } = Route.useRouteContext()
  return (
    <PageHeader
      title="Dashboard"
      description={
        <>
          Signed in as <span data-testid="admin-email">{admin.email}</span>
        </>
      }
    />
  )
}
