import { createFileRoute, notFound } from '@tanstack/react-router'
import { getPublicInvoiceAction } from '#/server/invoices-actions'
import { PublicInvoiceView } from './-components/public-invoice'

export const Route = createFileRoute('/i/$token/')({
  loader: async ({ params }) => {
    const invoice = await getPublicInvoiceAction({ data: params.token })
    if (!invoice) throw notFound()
    return invoice
  },
  head: () => ({
    meta: [
      { title: 'Invoice' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  notFoundComponent: () => (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-xl font-semibold">Invoice not found</h1>
      <p className="text-muted-foreground">
        This link is not valid. Check it with the sender.
      </p>
    </main>
  ),
  component: PublicInvoicePage,
})

function PublicInvoicePage() {
  return <PublicInvoiceView invoice={Route.useLoaderData()} />
}
