import { Link } from '@tanstack/react-router'
import PageHeader from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import type { InvoiceDetail } from '#/server/invoices'
import { InvoiceStatusBadge } from './invoice-status-badge'
import { InvoiceTotalsList } from './invoice-totals-list'

export function InvoiceView({ invoice: detail }: { invoice: InvoiceDetail }) {
  const { invoice, client, items, totals } = detail
  const money = (minor: number) => formatMinor(minor, invoice.currency)

  return (
    <>
      <PageHeader
        title={invoice.number}
        description={
          <span className="inline-flex items-center gap-2">
            <InvoiceStatusBadge status={invoice.status} />
            <Link
              to="/admin/clients/$clientId"
              params={{ clientId: client.id }}
              className="underline-offset-4 hover:underline"
            >
              {client.name}
            </Link>
          </span>
        }
      >
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to="/admin/invoices" />}
        >
          Back to invoices
        </Button>
      </PageHeader>
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent>
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
                    <TableCell className="text-right">
                      {item.quantity}
                    </TableCell>
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
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p>
                <span className="text-muted-foreground">Issued </span>
                {formatDate(`${invoice.issueDate}T00:00:00`)}
              </p>
              <p>
                <span className="text-muted-foreground">Due </span>
                {formatDate(`${invoice.dueDate}T00:00:00`)}
              </p>
              <p className="text-muted-foreground">
                Only draft invoices can be edited.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Totals</CardTitle>
            </CardHeader>
            <CardContent>
              <InvoiceTotalsList
                totals={totals}
                currency={invoice.currency}
                taxRateBps={invoice.taxRateBps}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
