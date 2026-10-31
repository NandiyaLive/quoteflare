import { displayOf, moneyIn } from '#/lib/currencies'

/**
 * The amount in the currency the client sees, as a small note under the base
 * amount. Renders nothing when the record has no display currency.
 */
export function ConvertedAmount({
  minor,
  currency,
  record,
  showRate = false,
  className,
}: {
  minor: number
  currency: string
  record: { displayCurrency: string | null; displayRate: number | null }
  showRate?: boolean
  className?: string
}) {
  const display = displayOf(record)
  if (!display) return null
  return (
    <span
      className={`block text-xs font-normal text-muted-foreground ${className ?? ''}`}
    >
      ≈ {moneyIn(currency, display)(minor)}
      {showRate &&
        ` (1 ${currency} = ${display.rate} ${display.currency}, as the client sees it)`}
    </span>
  )
}
