import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb, schema, type Db } from '#/db'
import { createTestD1 } from '#/db/test-db'
import { runDailyJobs } from './daily'

let db: Db
let d1: D1Database
let dispose: () => Promise<void>
let clientId: string

beforeAll(async () => {
  const test = await createTestD1()
  d1 = test.d1
  db = createDb(d1)
  dispose = test.dispose
})

afterAll(() => dispose())

beforeEach(async () => {
  await db.delete(schema.invoices)
  await db.delete(schema.clients)
  const [client] = await db
    .insert(schema.clients)
    .values({ name: 'Acme' })
    .returning()
  clientId = client.id
})

const now = new Date('2026-06-15T03:30:00Z')

const env = () => ({
  DB: d1,
  RESEND_API_KEY: 're_test',
  EMAIL_FROM: 'Invoices <invoices@example.test>',
  APP_ORIGIN: 'https://invoices.example.test',
})

const addInvoice = async (
  number: string,
  status: (typeof schema.invoices.$inferInsert)['status'],
  dueDate: string,
) => {
  const [row] = await db
    .insert(schema.invoices)
    .values({
      number,
      clientId,
      status,
      issueDate: '2026-06-01',
      dueDate,
      currency: 'LKR',
    })
    .returning()
  return row.id
}

const statusOf = async (id: string) =>
  (
    await db
      .select({ status: schema.invoices.status })
      .from(schema.invoices)
      .where(eq(schema.invoices.id, id))
  )[0].status

describe('runDailyJobs', () => {
  it('marks only sent invoices due before today as overdue', async () => {
    const late = await addInvoice('A-1', 'sent', '2026-06-14')
    const upcoming = await addInvoice('A-2', 'sent', '2026-06-16')

    const result = await runDailyJobs(env(), now)

    expect(result.markedOverdue).toBe(1)
    expect(await statusOf(late)).toBe('overdue')
    expect(await statusOf(upcoming)).toBe('sent')
  })

  it('leaves invoices due today untouched', async () => {
    const dueToday = await addInvoice('A-1', 'sent', '2026-06-15')
    await runDailyJobs(env(), now)
    expect(await statusOf(dueToday)).toBe('sent')
  })

  it('ignores draft, paid and void invoices', async () => {
    const ids = [
      await addInvoice('A-1', 'draft', '2026-06-01'),
      await addInvoice('A-2', 'paid', '2026-06-01'),
      await addInvoice('A-3', 'void', '2026-06-01'),
    ]
    const result = await runDailyJobs(env(), now)
    expect(result.markedOverdue).toBe(0)
    expect(await Promise.all(ids.map(statusOf))).toEqual([
      'draft',
      'paid',
      'void',
    ])
  })

  it('changes nothing on a second run', async () => {
    await addInvoice('A-1', 'sent', '2026-06-14')
    expect((await runDailyJobs(env(), now)).markedOverdue).toBe(1)
    expect((await runDailyJobs(env(), now)).markedOverdue).toBe(0)
  })
})
