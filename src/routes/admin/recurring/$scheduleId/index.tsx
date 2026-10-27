import { createFileRoute, notFound } from '@tanstack/react-router'
import {
  getRecurringFormContext,
  getScheduleDetail,
} from '#/server/recurring-actions'
import { RecurringEditor } from '../-components/recurring-editor'

export const Route = createFileRoute('/admin/recurring/$scheduleId/')({
  staticData: { breadcrumb: 'Schedule' },
  loader: async ({ params }) => {
    const [schedule, context] = await Promise.all([
      getScheduleDetail({ data: params.scheduleId }),
      getRecurringFormContext(),
    ])
    if (!schedule) throw notFound()
    return { schedule, context }
  },
  notFoundComponent: () => (
    <p className="text-muted-foreground">This schedule does not exist.</p>
  ),
  component: SchedulePage,
})

function SchedulePage() {
  const { schedule, context } = Route.useLoaderData()
  return <RecurringEditor context={context} schedule={schedule} />
}
