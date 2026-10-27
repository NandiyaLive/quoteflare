import { createFileRoute } from '@tanstack/react-router'
import { getQuotes } from '#/server/quote-actions'
import { QuotesList } from './-components/quotes-list'

export const Route = createFileRoute('/admin/quotes/')({
  loader: () => getQuotes({ data: { status: 'all' } }),
  component: QuotesPage,
})

function QuotesPage() {
  return <QuotesList quotes={Route.useLoaderData()} />
}
