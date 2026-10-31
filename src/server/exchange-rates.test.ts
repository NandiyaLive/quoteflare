import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb, schema, type Db } from '#/db'
import { createTestD1 } from '#/db/test-db'
import { getRates, refreshRates } from './exchange-rates'

let db: Db
let dispose: () => Promise<void>

beforeAll(async () => {
  const test = await createTestD1()
  db = createDb(test.d1)
  dispose = test.dispose
})

afterAll(() => dispose())

beforeEach(async () => {
  await db.delete(schema.exchangeRates)
})

const now = new Date('2026-10-31T12:00:00Z')
const hoursAgo = (hours: number) =>
  new Date(now.getTime() - hours * 3600_000).toISOString()

const frankfurter = (rates: Record<string, number>, ok = true) => {
  const calls: string[] = []
  const fetcher = (async (url: URL | string) => {
    calls.push(String(url))
    return new Response(
      JSON.stringify(
        Object.entries(rates).map(([quote, rate]) => ({ quote, rate })),
      ),
      { status: ok ? 200 : 500 },
    )
  }) as typeof fetch
  return { fetcher, calls }
}

const seed = (fetchedAt: string, rates: Record<string, number>) =>
  db.insert(schema.exchangeRates).values(
    Object.entries(rates).map(([quote, rate]) => ({
      base: 'USD',
      quote,
      rate,
      fetchedAt,
    })),
  )

describe('exchange rates', () => {
  it('fetches and stores rates when none are stored', async () => {
    const { fetcher, calls } = frankfurter({ EUR: 0.92, GBP: 0.8, JPY: 150 })
    const rates = await getRates(db, 'USD', ['EUR', 'GBP'], fetcher, now)
    expect(rates).toEqual({ EUR: 0.92, GBP: 0.8 })
    expect(calls).toHaveLength(1)
    expect(await db.select().from(schema.exchangeRates)).toHaveLength(2)
  })

  it('serves fresh stored rates without fetching', async () => {
    await seed(hoursAgo(2), { EUR: 0.9 })
    const { fetcher, calls } = frankfurter({ EUR: 0.95 })
    expect(await getRates(db, 'USD', ['EUR'], fetcher, now)).toEqual({
      EUR: 0.9,
    })
    expect(calls).toHaveLength(0)
  })

  it('refreshes rates over a day old', async () => {
    await seed(hoursAgo(30), { EUR: 0.9 })
    const { fetcher } = frankfurter({ EUR: 0.95 })
    expect(await getRates(db, 'USD', ['EUR'], fetcher, now)).toEqual({
      EUR: 0.95,
    })
  })

  it('serves the stale rates when the refresh fails', async () => {
    await seed(hoursAgo(30), { EUR: 0.9 })
    const { fetcher } = frankfurter({}, false)
    expect(await getRates(db, 'USD', ['EUR'], fetcher, now)).toEqual({
      EUR: 0.9,
    })
  })

  it('returns nothing when no currency is approved', async () => {
    const { fetcher, calls } = frankfurter({ EUR: 0.92 })
    expect(await getRates(db, 'USD', ['USD'], fetcher, now)).toEqual({})
    expect(calls).toHaveLength(0)
  })

  it('keeps the old rates when a refresh returns nothing', async () => {
    await seed(hoursAgo(30), { EUR: 0.9 })
    const { fetcher } = frankfurter({})
    expect(await refreshRates(db, 'USD', ['EUR'], fetcher, now)).toBe(false)
    expect(await db.select().from(schema.exchangeRates)).toHaveLength(1)
  })
})
