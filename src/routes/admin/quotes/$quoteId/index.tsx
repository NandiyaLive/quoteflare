import { createFileRoute, notFound } from '@tanstack/react-router'
import { getQuoteDetail } from '#/server/quote-actions'
import { QuoteDetail } from '../-components/quote-detail'

export const Route = createFileRoute('/admin/quotes/$quoteId/')({
  staticData: { breadcrumb: 'Quote' },
  loader: async ({ params }) => {
    const quote = await getQuoteDetail({ data: params.quoteId })
    if (!quote) throw notFound()
    return quote
  },
  notFoundComponent: () => (
    <p className="text-muted-foreground">This quote does not exist.</p>
  ),
  component: QuotePage,
})

function QuotePage() {
  return <QuoteDetail quote={Route.useLoaderData()} />
}
