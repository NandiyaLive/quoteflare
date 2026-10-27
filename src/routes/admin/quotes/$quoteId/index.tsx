import { createFileRoute, notFound } from '@tanstack/react-router'
import { getQuoteDetail } from '#/server/quote-actions'
import { QuoteDetail } from '../-components/quote-detail'

export const Route = createFileRoute('/admin/quotes/$quoteId/')({
  staticData: { breadcrumb: 'Quote' },
  loader: async ({ params }) => {
    const detail = await getQuoteDetail({ data: params.quoteId })
    if (!detail) throw notFound()
    return { ...detail, crumb: `Quote from ${detail.quote.contactName}` }
  },
  notFoundComponent: () => (
    <p className="text-muted-foreground">This quote does not exist.</p>
  ),
  component: QuotePage,
})

function QuotePage() {
  const { quote, invoice } = Route.useLoaderData()
  return <QuoteDetail quote={quote} invoice={invoice} />
}
