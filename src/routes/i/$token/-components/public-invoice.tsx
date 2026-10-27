import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/lib/format'
import { formatMinor } from '#/lib/decimal'
import { INVOICE_STATUS_LABELS } from '#/lib/invoices'
import type { PublicInvoice } from '#/server/invoices'
import { InvoiceTotalsList } from '@/components/common/invoice-totals-list'

export function PublicInvoiceView({
  invoice: data,
}: {
  invoice: PublicInvoice
}) {
  const { invoice, client, business, items, totals } = data
  const money = (minor: number) => formatMinor(minor, invoice.currency)

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-4 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          {business.hasLogo && (
            <img
              src="/files/logo"
              alt={business.name}
              className="mb-2 max-h-16 w-auto self-start"
            />
          )}
          <h2 className="text-lg font-semibold">{business.name}</h2>
          <p className="text-sm whitespace-pre-line text-muted-foreground">
            {business.address}
          </p>
          <p className="text-sm text-muted-foreground">{business.email}</p>
        </div>
        <div className="flex flex-col gap-1 sm:items-end">
          <h1 className="text-2xl font-semibold">Invoice {invoice.number}</h1>
          <Badge variant={invoice.status === 'paid' ? 'secondary' : 'outline'}>
            {INVOICE_STATUS_LABELS[invoice.status]}
          </Badge>
        </div>
      </header>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1 text-sm">
          <h3 className="text-muted-foreground">Billed to</h3>
          <p className="font-medium">{client.name}</p>
          {client.company && <p>{client.company}</p>}
          {client.address && (
            <p className="whitespace-pre-line">{client.address}</p>
          )}
          {client.email && <p>{client.email}</p>}
        </div>
        <dl className="flex flex-col gap-1 text-sm sm:items-end">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Issued</dt>
            <dd>{formatDate(`${invoice.issueDate}T00:00:00`)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Due</dt>
            <dd>{formatDate(`${invoice.dueDate}T00:00:00`)}</dd>
          </div>
        </dl>
      </section>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Unit price</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="whitespace-normal">
                {item.description}
              </TableCell>
              <TableCell className="text-right">{item.quantity}</TableCell>
              <TableCell className="text-right tabular-nums">
                {money(item.unitPrice)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {money(item.quantity * item.unitPrice)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="sm:ml-auto sm:w-72">
        <InvoiceTotalsList
          totals={totals}
          currency={invoice.currency}
          taxRateBps={invoice.taxRateBps}
        />
      </div>

      {business.paymentInstructions && (
        <section className="flex flex-col gap-1 text-sm">
          <h3 className="font-medium">Payment instructions</h3>
          <p className="whitespace-pre-line text-muted-foreground">
            {business.paymentInstructions}
          </p>
        </section>
      )}
    </main>
  )
}
