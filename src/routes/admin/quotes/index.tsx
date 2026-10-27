import { createFileRoute } from '@tanstack/react-router'
import { quoteFilterSchema } from '#/lib/quotes'
import { getQuotes } from '#/server/quote-actions'
import { QuotesList } from './-components/quotes-list'

export const Route = createFileRoute('/admin/quotes/')({
  staticData: { breadcrumb: 'Quotes' },
  validateSearch: quoteFilterSchema,
  loaderDeps: ({ search }) => ({ status: search.status }),
  loader: ({ deps }) => getQuotes({ data: deps }),
  component: QuotesPage,
})

function QuotesPage() {
  const quotes = Route.useLoaderData()
  const { status } = Route.useSearch()
  return <QuotesList quotes={quotes} status={status} />
}
