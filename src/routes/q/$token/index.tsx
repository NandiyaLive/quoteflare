import { createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { PrinterIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { moneyIn } from '#/lib/currencies'
import { formatMinor } from '#/lib/decimal'
import { callAction } from '#/lib/action-errors'
import { QUOTE_STATUS_LABELS } from '#/lib/quotes'
import type { PricedLine } from '#/lib/pricing'
import { BILLING_LABELS } from '#/lib/services'
import {
  getPublicQuoteAction,
  respondToQuoteAction,
} from '#/server/quote-actions'

export const Route = createFileRoute('/q/$token/')({
  loader: async ({ params }) => {
    const quote = await getPublicQuoteAction({ data: params.token })
    if (!quote) throw notFound()
    return quote
  },
  head: () => ({
    meta: [
      { title: 'Quote' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  notFoundComponent: () => (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-xl font-semibold">Quote not found</h1>
      <p className="text-muted-foreground">
        This link is not valid. Check it with the sender.
      </p>
    </main>
  ),
  component: PublicQuotePage,
})

function Lines({
  lines,
  money,
  recurring,
}: {
  lines: PricedLine[]
  money: (minor: number) => string
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
            <TableCell className="whitespace-normal">
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
                  {option.name}: {money(option.amount)}
                </div>
              ))}
            </TableCell>
            <TableCell className="text-right">{line.quantity}</TableCell>
            <TableCell className="text-right tabular-nums">
              {money(line.unitPrice)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {money(line.amount)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PublicQuotePage() {
  const { token } = Route.useParams()
  const { quote, contactName, breakdown, business } = Route.useLoaderData()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<'accepted' | 'declined' | null>(
    null,
  )
  const { currency, display } = quote
  const money = moneyIn(currency, display)

  const respond = async (response: 'accepted' | 'declined') => {
    setBusy(true)
    try {
      const result = await callAction(
        () => respondToQuoteAction({ data: { token, response } }),
        'Could not send your answer. Try again.',
      )
      if (!result) return
      if (!result.ok) toast.error(result.error)
      await router.invalidate()
    } finally {
      setBusy(false)
      setConfirming(null)
    }
  }

  const answer = {
    accepted: 'You accepted this quote. We will be in touch about next steps.',
    declined: 'You declined this quote.',
    expired: 'This quote has expired. Contact us for a new one.',
    converted: 'This quote has been turned into an invoice.',
  } as const

  return (
    <main
      data-print-root
      className="mx-auto flex max-w-3xl flex-col gap-8 p-4 sm:p-8"
    >
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
          <h1 className="text-2xl font-semibold">Quote {quote.number ?? ''}</h1>
          <Button
            data-print-hide
            variant="outline"
            size="sm"
            className="mb-1 sm:self-end"
            onClick={() => window.print()}
          >
            <PrinterIcon data-icon="inline-start" />
            Download PDF
          </Button>
          <Badge variant="outline">{QUOTE_STATUS_LABELS[quote.status]}</Badge>
        </div>
      </header>

      <section className="flex flex-col gap-1 text-sm">
        <p>
          Prepared for <span className="font-medium">{contactName}</span>
        </p>
        {quote.validUntil && (
          <p className="text-muted-foreground">
            Valid until {formatDate(`${quote.validUntil}T00:00:00`)}
          </p>
        )}
      </section>

      <Lines lines={breakdown.lines} money={money} />

      {breakdown.recurring.lines.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Recurring charges</p>
          <Lines lines={breakdown.recurring.lines} money={money} recurring />
          <p className="text-right text-sm">
            Recurring total {money(breakdown.recurring.total)}
          </p>
        </div>
      )}

      <div data-print-keep className="sm:ml-auto sm:w-72">
        <Separator className="mb-3" />
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{money(breakdown.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Tax</dt>
            <dd className="tabular-nums">{money(breakdown.taxAmount)}</dd>
          </div>
          <div className="flex justify-between gap-4 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{money(quote.total)}</dd>
          </div>
        </dl>
        {display && (
          <p className="mt-2 text-xs text-muted-foreground">
            Shown in {display.currency} at 1 {currency} = {display.rate}{' '}
            {display.currency}. The quote total is{' '}
            {formatMinor(quote.total, currency)}.
          </p>
        )}
      </div>

      {quote.status === 'sent' ? (
        <section data-print-hide className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => setConfirming('accepted')}>
            Accept quote
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setConfirming('declined')}
          >
            Decline
          </Button>
          <Dialog
            open={confirming !== null}
            onOpenChange={(open) => {
              if (!open) setConfirming(null)
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {confirming === 'declined'
                    ? 'Decline this quote?'
                    : 'Accept this quote?'}
                </DialogTitle>
                <DialogDescription>
                  You are{' '}
                  {confirming === 'declined' ? 'declining' : 'accepting'} quote{' '}
                  {quote.number ?? ''} for {money(quote.total)}. You cannot undo
                  this.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirming(null)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => confirming && void respond(confirming)}
                >
                  {confirming === 'declined' ? 'Decline quote' : 'Accept quote'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>
      ) : (
        <Alert data-print-hide>
          <AlertTitle>{QUOTE_STATUS_LABELS[quote.status]}</AlertTitle>
          <AlertDescription>{answer[quote.status]}</AlertDescription>
        </Alert>
      )}
    </main>
  )
}
