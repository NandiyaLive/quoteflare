import { useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import PageHeader from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
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
import type { PricedLine } from '#/lib/pricing'
import { BILLING_LABELS } from '#/lib/services'
import { setQuoteStatusAction } from '#/server/quote-actions'
import type { QuoteRow } from '#/server/quotes'
import { QuoteStatusBadge } from './quote-status-badge'

function LinesTable({
  lines,
  currency,
  recurring,
}: {
  lines: PricedLine[]
  currency: string
  recurring?: boolean
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Unit price</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.serviceId}>
            <TableCell>
              <div className="font-medium">
                {line.name}
                {recurring && (
                  <span className="font-normal text-muted-foreground">
                    {' '}
                    ({BILLING_LABELS[line.billing].toLowerCase()})
                  </span>
                )}
              </div>
              {line.options.map((option) => (
                <div key={option.optionId} className="text-muted-foreground">
                  {option.name}: {formatMinor(option.amount, currency)}
                </div>
              ))}
            </TableCell>
            <TableCell className="text-right">{line.quantity}</TableCell>
            <TableCell className="text-right">
              {formatMinor(line.unitPrice, currency)}
            </TableCell>
            <TableCell className="text-right">
              {formatMinor(line.amount, currency)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function QuoteDetail({ quote }: { quote: QuoteRow }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { breakdown, currency } = quote

  const change = async (status: 'new' | 'dismissed') => {
    setBusy(true)
    setError(null)
    try {
      const result = await setQuoteStatusAction({
        data: { id: quote.id, status },
      })
      if (!result.ok) setError('This quote can no longer be changed.')
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title={`Quote from ${quote.contactName}`}
        description={
          <span className="inline-flex items-center gap-2">
            <QuoteStatusBadge status={quote.status} />
            {formatDate(quote.createdAt)}
          </span>
        }
      >
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to="/admin/quotes" search={{ status: 'all' }} />}
        >
          Back to quotes
        </Button>
        {quote.status === 'new' && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void change('dismissed')}
          >
            Dismiss
          </Button>
        )}
        {quote.status === 'dismissed' && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void change('new')}
          >
            Reopen
          </Button>
        )}
      </PageHeader>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {breakdown ? (
              <>
                <LinesTable lines={breakdown.lines} currency={currency} />
                {breakdown.recurring.lines.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">Recurring charges</p>
                    <LinesTable
                      lines={breakdown.recurring.lines}
                      currency={currency}
                      recurring
                    />
                    <p className="text-right text-sm">
                      Recurring total{' '}
                      <span data-testid="quote-recurring-total">
                        {formatMinor(breakdown.recurring.total, currency)}
                      </span>
                    </p>
                  </div>
                )}
                <Separator />
                <dl className="ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt>Subtotal</dt>
                    <dd>{formatMinor(breakdown.subtotal, currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Tax</dt>
                    <dd>{formatMinor(breakdown.taxAmount, currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-4 text-base font-semibold">
                    <dt>Total</dt>
                    <dd data-testid="quote-total">
                      {formatMinor(quote.total, currency)}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="text-muted-foreground">
                No itemised breakdown was stored. Total{' '}
                {formatMinor(quote.total, currency)}.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <div>
              <div className="font-medium">{quote.contactName}</div>
              <a
                href={`mailto:${quote.contactEmail}`}
                className="text-muted-foreground underline-offset-4 hover:underline"
              >
                {quote.contactEmail}
              </a>
            </div>
            <Separator />
            <div>
              <p className="mb-1 font-medium">Message</p>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {quote.message || 'No message.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
