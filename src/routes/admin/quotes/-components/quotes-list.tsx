import { Link, useNavigate } from '@tanstack/react-router'
import PageHeader from '@/components/common/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  QUOTE_STATUS_FILTERS,
  QUOTE_STATUS_LABELS,
  type QuoteStatusFilter,
} from '#/lib/quotes'
import type { QuoteRow } from '#/server/quotes'
import { QuoteStatusBadge } from './quote-status-badge'

const FILTER_LABELS: Record<QuoteStatusFilter, string> = {
  all: 'All quotes',
  ...QUOTE_STATUS_LABELS,
}

export function QuotesList({
  quotes,
  status,
}: {
  quotes: QuoteRow[]
  status: QuoteStatusFilter
}) {
  const navigate = useNavigate({ from: '/admin/quotes/' })

  return (
    <>
      <PageHeader
        title="Quotes"
        description="Requests submitted from the calculator."
      >
        <Select
          value={status}
          onValueChange={(value) =>
            void navigate({
              search: { status: value as QuoteStatusFilter },
            })
          }
        >
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue>{FILTER_LABELS[status]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {QUOTE_STATUS_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {FILTER_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeader>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Received</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotes.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-muted-foreground"
                >
                  No quotes yet.
                </TableCell>
              </TableRow>
            )}
            {quotes.map((quote) => (
              <TableRow key={quote.id}>
                <TableCell>
                  <Link
                    to="/admin/quotes/$quoteId"
                    params={{ quoteId: quote.id }}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {formatDate(quote.createdAt, { month: 'short' })}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{quote.contactName}</div>
                  <div className="text-muted-foreground">
                    {quote.contactEmail}
                  </div>
                </TableCell>
                <TableCell>
                  <QuoteStatusBadge status={quote.status} />
                </TableCell>
                <TableCell className="text-right">
                  {formatMinor(quote.total, quote.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
