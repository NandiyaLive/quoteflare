import { formatMinor } from '#/lib/decimal'
import type { InvoiceTotals } from '#/lib/invoices'

export function InvoiceTotalsList({
  totals,
  currency,
  taxRateBps,
}: {
  totals: InvoiceTotals
  currency: string
  taxRateBps: number
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
    </dl>
  )
}
