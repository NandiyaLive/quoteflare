import { createFileRoute } from '@tanstack/react-router'
import { recurringIntervals } from '#/db/schema'
import { getQuoteSchedulePrefillAction } from '#/server/quote-actions'
import { getRecurringFormContext } from '#/server/recurring-actions'
import { RecurringEditor } from '../-components/recurring-editor'

type NewScheduleSearch = {
  quoteId?: string
  interval?: (typeof recurringIntervals)[number]
}

export const Route = createFileRoute('/admin/recurring/new/')({
  staticData: { breadcrumb: 'New schedule' },
  validateSearch: (search: Record<string, unknown>): NewScheduleSearch => {
    const interval = recurringIntervals.find((v) => v === search.interval)
    return typeof search.quoteId === 'string' && interval
      ? { quoteId: search.quoteId, interval }
      : {}
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [context, prefill] = await Promise.all([
      getRecurringFormContext(),
      deps.quoteId && deps.interval
        ? getQuoteSchedulePrefillAction({
            data: { quoteId: deps.quoteId, interval: deps.interval },
          })
        : null,
    ])
    return { context, prefill }
  },
  component: NewSchedulePage,
})

function NewSchedulePage() {
  const { context, prefill } = Route.useLoaderData()
  return <RecurringEditor context={context} schedule={null} prefill={prefill} />
}
