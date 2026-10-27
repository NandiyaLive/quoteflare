import { createFileRoute } from '@tanstack/react-router'
import { getSchedules } from '#/server/recurring-actions'
import { RecurringList } from './-components/recurring-list'

export const Route = createFileRoute('/admin/recurring/')({
  loader: () => getSchedules(),
  component: RecurringPage,
})

function RecurringPage() {
  return <RecurringList schedules={Route.useLoaderData()} />
}
