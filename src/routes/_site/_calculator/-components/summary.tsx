import { useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { format } from 'date-fns'
import {
  ArrowRightIcon,
  RotateCcwIcon,
  SaveIcon,
  Trash2Icon,
} from 'lucide-react'
import { useConfirm } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { bpsToPercent } from '#/lib/decimal'
import type { PricingBreakdown } from '#/lib/pricing'
import { BILLING_LABELS } from '#/lib/services'
import { useCalculator } from './calculator-context'
import { CurrencyPicker } from './currency-picker'

function LocalQuotes() {
  const { localQuotes, loadLocalQuote, removeLocalQuote, money } =
    useCalculator()
  if (localQuotes.length === 0) return null
  return (
    <Card className="[--card-spacing:--spacing(5)]">
      <CardHeader>
        <CardTitle>Saved in this browser</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {localQuotes.map((quote) => (
            <li key={quote.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-medium">
                  {quote.name || 'Untitled quote'}
                </p>
                <p className="truncate text-muted-foreground">
                  {money(quote.total)} · {format(quote.savedAt, 'd MMM yyyy')}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadLocalQuote(quote.id)}
              >
                Load
              </Button>
              <Button
                variant="destructive"
                size="icon-sm"
                aria-label="Delete saved quote"
                onClick={() => removeLocalQuote(quote.id)}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function SaveQuoteDialog() {
  const { saveLocalQuote } = useCalculator()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const trimmed = name.trim()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setName('')
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <SaveIcon />
        Save in this browser
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!trimmed) return
            saveLocalQuote(trimmed)
            setOpen(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>Save quote</DialogTitle>
            <DialogDescription>
              Name this selection. It stays in this browser, and you can load it
              back into the calculator later.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="local-quote-name">Name</FieldLabel>
            <Input
              id="local-quote-name"
              value={name}
              maxLength={60}
              autoFocus
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={!trimmed}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Row({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div
      className={cn(
        'flex justify-between gap-4',
        strong ? 'text-lg font-semibold' : 'text-sm',
      )}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export function Summary({
  breakdown,
  taxRateBps,
}: {
  breakdown: PricingBreakdown
  taxRateBps: number
}) {
  const { money, catalog, displayCurrency, reset } = useCalculator()
  const { confirm, dialog } = useConfirm()
  const { recurring } = breakdown
  const hasRecurring = recurring.lines.length > 0
  const { pathname } = useLocation()
  const onScope = pathname.replace(/(.)\/$/, '$1') === '/scope'

  return (
    <>
      <aside
        id="summary"
        className="flex flex-col gap-4 lg:sticky lg:top-30 lg:self-start"
      >
        <LocalQuotes />
        <Card className="[--card-spacing:--spacing(5)]">
          <CardHeader>
            <CardTitle>Your estimate</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CurrencyPicker />
            <dl className="flex flex-col gap-2">
              {breakdown.lines.map((line) => (
                <div
                  key={line.serviceId}
                  className="flex justify-between gap-4 text-sm text-muted-foreground"
                >
                  <dt>
                    {line.name}
                    {line.quantity > 1 && ` x ${line.quantity}`}
                  </dt>
                  <dd>{money(line.amount)}</dd>
                </div>
              ))}
              {breakdown.lines.length === 0 && !hasRecurring && (
                <p className="text-sm text-muted-foreground">
                  Nothing selected yet.
                </p>
              )}
            </dl>
            <Separator />
            <dl className="flex flex-col gap-2">
              <Row label="Subtotal" value={money(breakdown.subtotal)} />
              <Row
                label={`Tax (${bpsToPercent(taxRateBps)}%)`}
                value={money(breakdown.taxAmount)}
              />
              <Row label="Total" value={money(breakdown.total)} strong />
            </dl>
            {hasRecurring && (
              <>
                <Separator />
                <dl className="flex flex-col gap-2">
                  <p className="text-sm font-medium">Recurring charges</p>
                  {recurring.lines.map((line) => (
                    <div
                      key={line.serviceId}
                      className="flex justify-between gap-4 text-sm text-muted-foreground"
                    >
                      <dt>
                        {line.name} (
                        {BILLING_LABELS[line.billing].toLowerCase()})
                        {line.quantity > 1 && ` x ${line.quantity}`}
                      </dt>
                      <dd>{money(line.amount)}</dd>
                    </div>
                  ))}
                  <Row
                    label="Recurring tax"
                    value={money(recurring.taxAmount)}
                  />
                  <Row label="Recurring total" value={money(recurring.total)} />
                </dl>
              </>
            )}
            {displayCurrency !== catalog.currency && (
              <p className="text-xs text-muted-foreground">
                Converted from {catalog.currency} at today&apos;s rate. Your
                quote is issued in {catalog.currency}.
              </p>
            )}
            <div className="flex flex-col gap-2">
              {breakdown.lines.length > 0 && (
                <>
                  <SaveQuoteDialog />
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Clear the calculator?',
                        description:
                          'This removes every selected service. Quotes saved in this browser are kept.',
                        confirmLabel: 'Clear',
                      })
                      if (ok) reset()
                    }}
                  >
                    <RotateCcwIcon />
                    Clear calculator
                  </Button>
                </>
              )}
              {onScope && (
                <Button nativeButton={false} render={<Link to="/review" />}>
                  Review quote
                  <ArrowRightIcon />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </aside>
      {dialog}
      <a
        href="#summary"
        className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between border-t bg-background px-4 py-3 lg:hidden"
      >
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="text-lg font-semibold">{money(breakdown.total)}</span>
      </a>
    </>
  )
}
