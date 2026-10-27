import { createFileRoute } from '@tanstack/react-router'
import { getOverview } from '#/server/overview-actions'
import { OverviewPage } from './-components/overview'

export const Route = createFileRoute('/admin/')({
  loader: () => getOverview(),
  component: AdminHome,
})

function AdminHome() {
  const { admin } = Route.useRouteContext()
  return <OverviewPage overview={Route.useLoaderData()} email={admin.email} />
}
