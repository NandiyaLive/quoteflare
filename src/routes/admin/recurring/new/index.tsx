import { createFileRoute } from '@tanstack/react-router'
import { getRecurringFormContext } from '#/server/recurring-actions'
import { RecurringEditor } from '../-components/recurring-editor'

export const Route = createFileRoute('/admin/recurring/new/')({
  staticData: { breadcrumb: 'New schedule' },
  loader: () => getRecurringFormContext(),
  component: NewSchedulePage,
})

function NewSchedulePage() {
  return <RecurringEditor context={Route.useLoaderData()} schedule={null} />
}
