import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb, schema, type Db } from './index'
import { createTestD1 } from './test-db'

let db: Db
let dispose: () => Promise<void>

beforeAll(async () => {
  const test = await createTestD1()
  db = createDb(test.d1)
  dispose = test.dispose
})

afterAll(() => dispose())

describe('invoice persistence', () => {
  it('stores an invoice with items and reads it back', async () => {
    const [client] = await db
      .insert(schema.clients)
      .values({ name: 'Test Client' })
      .returning()
    const [invoice] = await db
      .insert(schema.invoices)
      .values({
        number: 'INV-2026-0001',
        clientId: client.id,
        issueDate: '2026-01-15',
        dueDate: '2026-01-29',
        currency: 'USD',
        taxRateBps: 1000,
      })
      .returning()
    await db.insert(schema.invoiceItems).values([
      {
        invoiceId: invoice.id,
        description: 'Design',
        quantity: 1,
        unitPrice: 45000,
        sortOrder: 0,
      },
      {
        invoiceId: invoice.id,
        description: 'Build',
        quantity: 10,
        unitPrice: 6000,
        sortOrder: 1,
      },
    ])

    const [found] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, invoice.id))
    const items = await db
      .select()
      .from(schema.invoiceItems)
      .where(eq(schema.invoiceItems.invoiceId, invoice.id))
      .orderBy(schema.invoiceItems.sortOrder)

    expect(found).toMatchObject({
      number: 'INV-2026-0001',
      status: 'draft',
      issueDate: '2026-01-15',
      dueDate: '2026-01-29',
      taxRateBps: 1000,
      discount: 0,
      publicToken: null,
    })
    expect(items.map((i) => [i.description, i.quantity, i.unitPrice])).toEqual([
      ['Design', 1, 45000],
      ['Build', 10, 6000],
    ])
  })

  it('rejects an unknown status and a duplicate invoice number', async () => {
    const [client] = await db
      .insert(schema.clients)
      .values({ name: 'Other Client' })
      .returning()
    const base = {
      clientId: client.id,
      issueDate: '2026-02-01',
      dueDate: '2026-02-15',
      currency: 'USD',
    }

    await expect(
      db.insert(schema.invoices).values({
        ...base,
        number: 'INV-2026-0002',
        status: 'bogus' as 'draft',
      }),
    ).rejects.toThrow()
    await expect(
      db.insert(schema.invoices).values({ ...base, number: 'INV-2026-0001' }),
    ).rejects.toThrow()
  })
})
