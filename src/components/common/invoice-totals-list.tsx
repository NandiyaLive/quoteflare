import { formatMinor } from '#/lib/decimal'
import type { InvoiceAdvance, InvoiceTotals } from '#/lib/invoices'

export function InvoiceTotalsList({
  totals,
  currency,
  taxRateBps,
  advance = null,
}: {
  totals: InvoiceTotals
  currency: string
  taxRateBps: number
  advance?: InvoiceAdvance | null
}) {
  const money = (minor: number) => formatMinor(minor, currency)
  const rows = [
    ['Subtotal', money(totals.subtotal)],
    [
      'Discount',
      totals.discountAmount ? `-${money(totals.discountAmount)}` : money(0),
    ],
    [`Tax (${taxRateBps / 100}%)`, money(totals.taxAmount)],
  ]
  return (
    <dl className="flex flex-col gap-2 text-sm" data-testid="invoice-totals">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="tabular-nums">{value}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
        <dt>Total</dt>
        <dd className="tabular-nums" data-testid="invoice-total">
          {money(totals.total)}
        </dd>
      </div>
      {advance && (
        <div
          className="flex flex-col gap-2 border-t pt-2"
          data-testid="invoice-advance"
        >
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              Advance ({advance.bps / 100}%){advance.paidAt ? ', paid' : ''}
            </dt>
            <dd className="tabular-nums">{money(advance.advanceAmount)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Balance on completion</dt>
            <dd className="tabular-nums">{money(advance.balanceAmount)}</dd>
          </div>
        </div>
      )}
    </dl>
  )
}
