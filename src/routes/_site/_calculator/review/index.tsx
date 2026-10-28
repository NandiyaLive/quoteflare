import { createFileRoute } from '@tanstack/react-router'
import PoweredBy from '@/components/common/powered-by'
import { getQuoteConfig } from '#/server/quote-actions'
import { QuoteForm } from './-components/quote-form'

export const Route = createFileRoute('/_site/_calculator/review/')({
  loader: () => getQuoteConfig(),
  component: ReviewPage,
})

function ReviewPage() {
  const { turnstileSiteKey } = Route.useLoaderData()
  return (
    <>
      <QuoteForm turnstileSiteKey={turnstileSiteKey} />
      <PoweredBy className="mt-4 text-center text-sm text-muted-foreground" />
    </>
  )
}
