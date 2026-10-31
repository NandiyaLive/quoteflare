import { eq } from 'drizzle-orm'
import type { Db } from '#/db'
import { schema } from '#/db'
import { batch } from './invoices'

const FRANKFURTER_URL = 'https://api.frankfurter.dev/v2/rates'
const MAX_RATE_AGE_MS = 24 * 60 * 60 * 1000

const { exchangeRates } = schema

type FrankfurterRate = { quote: string; rate: number }

/**
 * Latest rates from `base` to each of `quotes`, from Frankfurter. Asks for
 * every rate and filters here, because Frankfurter rejects the whole request
 * if one code is unsupported. Returns an empty map when the request fails,
 * and omits currencies with no rate.
 */
export async function fetchRates(
  base: string,
  quotes: string[],
  fetcher: typeof fetch = fetch,
): Promise<Record<string, number>> {
  const wanted = quotes.filter((code) => code !== base)
  if (wanted.length === 0) return {}
  const url = new URL(FRANKFURTER_URL)
  url.searchParams.set('base', base)
  try {
    const response = await fetcher(url, {
      headers: { Accept: 'application/json' },
      cf: { cacheTtl: 3600, cacheEverything: true },
    })
    if (!response.ok) return {}
    const body = (await response.json()) as FrankfurterRate[]
    return Object.fromEntries(
      body
        .filter((r) => wanted.includes(r.quote) && r.rate > 0)
        .map((r) => [r.quote, r.rate]),
    )
  } catch {
    return {}
  }
}

/**
 * Fetches fresh rates and replaces the stored ones for `base`. Keeps the old
 * rates when the request fails or returns nothing. Returns whether it stored.
 */
export async function refreshRates(
  db: Db,
  base: string,
  quotes: string[],
  fetcher?: typeof fetch,
  now: Date = new Date(),
): Promise<boolean> {
  const rates = await fetchRates(base, quotes, fetcher)
  const entries = Object.entries(rates)
  if (entries.length === 0) return false
  const fetchedAt = now.toISOString()
  // One insert per row: D1 allows only 100 bound parameters per statement.
  await batch(db, [
    db.delete(exchangeRates).where(eq(exchangeRates.base, base)),
    ...entries.map(([quote, rate]) =>
      db.insert(exchangeRates).values({ base, quote, rate, fetchedAt }),
    ),
  ])
  return true
}

/**
 * Stored rates from `base` to each approved currency. Fetches first when
 * nothing is stored or the rates are over a day old, and falls back to the
 * stored rates when that fetch fails.
 */
export async function getRates(
  db: Db,
  base: string,
  approved: string[],
  fetcher?: typeof fetch,
  now: Date = new Date(),
): Promise<Record<string, number>> {
  const wanted = new Set(approved.filter((code) => code !== base))
  if (wanted.size === 0) return {}
  const read = async () =>
    (
      await db.select().from(exchangeRates).where(eq(exchangeRates.base, base))
    ).filter((row) => wanted.has(row.quote))

  let rows = await read()
  const oldest = Math.min(...rows.map((row) => Date.parse(row.fetchedAt)))
  if (rows.length === 0 || now.getTime() - oldest > MAX_RATE_AGE_MS) {
    if (await refreshRates(db, base, [...wanted], fetcher, now)) {
      rows = await read()
    }
  }
  return Object.fromEntries(rows.map((row) => [row.quote, row.rate]))
}
