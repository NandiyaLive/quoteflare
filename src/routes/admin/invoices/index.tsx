import { createFileRoute } from '@tanstack/react-router'
import { getInvoices } from '#/server/invoices-actions'
import { InvoicesList } from './-components/invoices-list'

export const Route = createFileRoute('/admin/invoices/')({
  staticData: { breadcrumb: 'Invoices' },
  loader: () => getInvoices(),
  component: InvoicesPage,
})

function InvoicesPage() {
  return <InvoicesList invoices={Route.useLoaderData()} />
}
