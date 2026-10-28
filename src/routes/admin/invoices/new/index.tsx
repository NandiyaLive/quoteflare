import { createFileRoute } from '@tanstack/react-router'
import { getInvoiceFormContext } from '#/server/invoices-actions'
import { InvoiceEditor } from '../-components/invoice-editor'

export const Route = createFileRoute('/admin/invoices/new/')({
  staticData: { breadcrumb: 'New invoice' },
  loader: () => getInvoiceFormContext(),
  component: function NewInvoicePage() {
    return <InvoiceEditor context={Route.useLoaderData()} invoice={null} />
  },
})
