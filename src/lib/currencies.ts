import { data } from 'currency-codes'
import { formatMinor } from './decimal'

export type CurrencyOption = { code: string; name: string }

/** ISO 4217 codes except funds and metals (XAU, XDR, ...), which have no rates. */
export const CURRENCY_OPTIONS: CurrencyOption[] = data
  .filter((c) => !c.code.startsWith('X'))
  .map((c) => ({ code: c.code, name: c.currency }))
  .sort((a, b) => a.code.localeCompare(b.code))

const DIGITS = new Map(data.map((c) => [c.code, c.digits]))

const digitsOf = (currency: string) => DIGITS.get(currency) ?? 2

/** Converts base-currency cents to the smallest unit of `to`. */
export const convertMinor = (minor: number, rate: number, to: string) =>
  Math.round((minor / 100) * rate * 10 ** digitsOf(to))

export const formatConverted = (minor: number, currency: string) =>
  new Intl.NumberFormat('en', { style: 'currency', currency }).format(
    minor / 10 ** digitsOf(currency),
  )

/** Currency a customer views amounts in and the rate from the base currency. */
export type DisplayCurrency = { currency: string; rate: number }

/**
 * The display currency stored on a quote, or null when the customer saw the
 * base currency.
 */
export const displayOf = (row: {
  displayCurrency: string | null
  displayRate: number | null
}): DisplayCurrency | null =>
  row.displayCurrency && row.displayRate && row.displayRate > 0
    ? { currency: row.displayCurrency, rate: row.displayRate }
    : null

/** Formats base-currency minor units in the display currency when there is one. */
export const moneyIn =
  (base: string, display: DisplayCurrency | null) => (minor: number) =>
    display
      ? formatConverted(
          convertMinor(minor, display.rate, display.currency),
          display.currency,
        )
      : formatMinor(minor, base)

/** Like `moneyIn`, with the base amount after a converted one: "€92.00 ($100.00)". */
export const moneyWithBase =
  (base: string, display: DisplayCurrency | null) => (minor: number) =>
    display
      ? `${moneyIn(base, display)(minor)} (${formatMinor(minor, base)})`
      : formatMinor(minor, base)
