import { createFileRoute, notFound } from '@tanstack/react-router'
import {
  getInvoiceDetail,
  getInvoiceFormContext,
} from '#/server/invoices-actions'
import { InvoiceEditor } from '../-components/invoice-editor'
import { InvoiceView } from '../-components/invoice-view'

export const Route = createFileRoute('/admin/invoices/$invoiceId/')({
  staticData: { breadcrumb: 'Invoice' },
  loader: async ({ params }) => {
    const [invoice, context] = await Promise.all([
      getInvoiceDetail({ data: params.invoiceId }),
      getInvoiceFormContext(),
    ])
    if (!invoice) throw notFound()
    return { invoice, context, crumb: invoice.invoice.number }
  },
  notFoundComponent: () => (
    <p className="text-muted-foreground">This invoice does not exist.</p>
  ),
  component: InvoicePage,
})

function InvoicePage() {
  const { invoice, context } = Route.useLoaderData()
  return invoice.invoice.status === 'draft' ? (
    <InvoiceEditor context={context} invoice={invoice} />
  ) : (
    <InvoiceView invoice={invoice} />
  )
}
