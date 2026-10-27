import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asc, eq } from 'drizzle-orm'
import { createDb, schema, type Db } from '#/db'
import { createTestD1 } from '#/db/test-db'
import { addInterval, nextRunAfter } from '#/lib/recurring'
import { runDailyJobs } from './daily'
import { MAX_SCHEDULES_PER_RUN, runRecurringSchedules } from './recurring'

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

const now = new Date('2026-06-15T03:30:00Z')
const env = () => ({
  DB: d1,
  RESEND_API_KEY: 're_test',
  EMAIL_FROM: 'Invoices <invoices@example.test>',
  APP_ORIGIN: 'https://invoices.example.test',
})

const deps = (fetcher?: typeof fetch) => ({
  apiKey: 're_test',
  from: 'Invoices <invoices@example.test>',
  origin: 'https://invoices.example.test',
  fetcher,
})

function fakeResend(status = 200) {
  const sent: { to: string[]; subject: string }[] = []
  const fetcher = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    if (status !== 200) {
      return Response.json({ message: 'rejected' }, { status })
    }
    sent.push({ to: body.to, subject: body.subject })
    return Response.json({ id: `re_${sent.length}` })
  }) as typeof fetch
  return { sent, fetcher }
}

beforeEach(async () => {
  await db.delete(schema.emailLog)
  await db.delete(schema.recurringSchedules)
  await db.delete(schema.invoiceItems)
  await db.delete(schema.invoices)
  await db.delete(schema.clients)
  await db.delete(schema.settings)
  await db.insert(schema.settings).values({
    id: 'main',
    businessName: 'Studio',
    currency: 'LKR',
    invoicePrefix: 'INV',
    nextInvoiceNumber: 7,
    taxRateBps: 1000,
    paymentTermDays: 30,
  })
  const [client] = await db
    .insert(schema.clients)
    .values({ name: 'Acme', email: 'client@example.test' })
    .returning()
  clientId = client.id
})

const addSchedule = async (
  nextRunDate: string,
  overrides: Partial<typeof schema.recurringSchedules.$inferInsert> = {},
) => {
  const [row] = await db
    .insert(schema.recurringSchedules)
    .values({
      clientId,
      interval: 'monthly',
      nextRunDate,
      items: [
        { description: 'Hosting', quantity: 2, unitPrice: 150000 },
        {
          description: 'Domain',
          quantity: 1,
          unitPrice: 50000,
          taxable: false,
        },
      ],
      ...overrides,
    })
    .returning()
  return row
}

const scheduleOf = async (id: string) =>
  (
    await db
      .select()
      .from(schema.recurringSchedules)
      .where(eq(schema.recurringSchedules.id, id))
  )[0]

const allInvoices = () =>
  db.select().from(schema.invoices).orderBy(asc(schema.invoices.number))

describe('date stepping', () => {
  it('adds each interval', () => {
    expect(addInterval('2026-06-15', 'weekly')).toBe('2026-06-22')
    expect(addInterval('2026-06-15', 'monthly')).toBe('2026-07-15')
    expect(addInterval('2026-06-15', 'quarterly')).toBe('2026-09-15')
    expect(addInterval('2026-06-15', 'yearly')).toBe('2027-06-15')
  })

  it('clamps to the last day of a shorter month and rolls the year', () => {
    expect(addInterval('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(addInterval('2028-02-29', 'yearly')).toBe('2029-02-28')
    expect(addInterval('2026-12-15', 'monthly')).toBe('2027-01-15')
  })

  it('steps past today when several periods were missed', () => {
    expect(nextRunAfter('2026-03-15', 'monthly', '2026-06-15')).toBe(
      '2026-07-15',
    )
  })
})

describe('runRecurringSchedules', () => {
  it('creates one draft invoice and moves the run date one interval', async () => {
    const schedule = await addSchedule('2026-06-15')

    const result = await runRecurringSchedules(db, deps(), now)

    expect(result).toEqual({ created: 1, sent: 0, failed: 0 })
    const [invoice] = await allInvoices()
    expect(invoice).toMatchObject({
      number: 'INV-2026-0007',
      clientId,
      status: 'draft',
      issueDate: '2026-06-15',
      dueDate: '2026-07-15',
      currency: 'LKR',
      taxRateBps: 1000,
      discount: 0,
      publicToken: null,
    })
    expect(invoice.id).toMatch(/^[a-z0-9]{24}$/)
    const items = await db
      .select()
      .from(schema.invoiceItems)
      .orderBy(asc(schema.invoiceItems.sortOrder))
    expect(
      items.map((i) => [i.description, i.quantity, i.unitPrice, i.taxable]),
    ).toEqual([
      ['Hosting', 2, 150000, true],
      ['Domain', 1, 50000, false],
    ])
    expect((await scheduleOf(schedule.id)).nextRunDate).toBe('2026-07-15')
    const [config] = await db.select().from(schema.settings)
    expect(config.nextInvoiceNumber).toBe(8)
  })

  it('creates nothing on a second run the same day', async () => {
    await addSchedule('2026-06-15')
    await runRecurringSchedules(db, deps(), now)
    const second = await runRecurringSchedules(db, deps(), now)
    expect(second.created).toBe(0)
    expect(await allInvoices()).toHaveLength(1)
  })

  it('creates one invoice for a schedule three months behind', async () => {
    const schedule = await addSchedule('2026-03-15')
    const result = await runRecurringSchedules(db, deps(), now)
    expect(result.created).toBe(1)
    expect(await allInvoices()).toHaveLength(1)
    expect((await scheduleOf(schedule.id)).nextRunDate).toBe('2026-07-15')
  })

  it('leaves schedules due in the future alone', async () => {
    const schedule = await addSchedule('2026-06-16')
    expect((await runRecurringSchedules(db, deps(), now)).created).toBe(0)
    expect((await scheduleOf(schedule.id)).nextRunDate).toBe('2026-06-16')
  })

  it('creates nothing for a paused schedule', async () => {
    const schedule = await addSchedule('2026-06-01', { active: false })
    expect((await runRecurringSchedules(db, deps(), now)).created).toBe(0)
    expect(await allInvoices()).toHaveLength(0)
    expect((await scheduleOf(schedule.id)).nextRunDate).toBe('2026-06-01')
  })

  it('skips a schedule whose client is archived', async () => {
    await db
      .update(schema.clients)
      .set({ archived: true })
      .where(eq(schema.clients.id, clientId))
    const schedule = await addSchedule('2026-06-15')
    expect((await runRecurringSchedules(db, deps(), now)).created).toBe(0)
    expect((await scheduleOf(schedule.id)).nextRunDate).toBe('2026-06-15')
  })

  it('numbers several schedules consecutively', async () => {
    await addSchedule('2026-06-15')
    await addSchedule('2026-06-10', { interval: 'weekly' })
    await runRecurringSchedules(db, deps(), now)
    expect((await allInvoices()).map((i) => i.number)).toEqual([
      'INV-2026-0007',
      'INV-2026-0008',
    ])
  })

  it('leaves the rest for the next run beyond the per-run limit', async () => {
    for (let i = 0; i < MAX_SCHEDULES_PER_RUN + 2; i++) {
      await addSchedule('2026-06-15')
    }
    expect((await runRecurringSchedules(db, deps(), now)).created).toBe(
      MAX_SCHEDULES_PER_RUN,
    )
    expect((await runRecurringSchedules(db, deps(), now)).created).toBe(2)
  })

  it('does not create a duplicate when two runs read the same schedule', async () => {
    await addSchedule('2026-06-15')
    const [a, b] = await Promise.all([
      runRecurringSchedules(db, deps(), now),
      runRecurringSchedules(db, deps(), now),
    ])
    expect(a.created + b.created).toBe(1)
    expect(await allInvoices()).toHaveLength(1)
    const [config] = await db.select().from(schema.settings)
    expect(config.nextInvoiceNumber).toBe(8)
  })

  it('emails and marks the invoice sent when auto send is on', async () => {
    await addSchedule('2026-06-15', { autoSend: true })
    const resend = fakeResend()

    const result = await runRecurringSchedules(db, deps(resend.fetcher), now)

    expect(result).toEqual({ created: 1, sent: 1, failed: 0 })
    const [invoice] = await allInvoices()
    expect(invoice.status).toBe('sent')
    expect(invoice.publicToken).toHaveLength(32)
    const logs = await db.select().from(schema.emailLog)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      invoiceId: invoice.id,
      type: 'invoice',
      status: 'sent',
      toAddress: 'client@example.test',
    })
    expect(resend.sent).toHaveLength(1)
  })

  it('leaves the invoice a draft when auto send is off', async () => {
    await addSchedule('2026-06-15', { autoSend: false })
    const resend = fakeResend()
    await runRecurringSchedules(db, deps(resend.fetcher), now)
    expect((await allInvoices())[0].status).toBe('draft')
    expect(resend.sent).toHaveLength(0)
    expect(await db.select().from(schema.emailLog)).toHaveLength(0)
  })

  it('keeps the draft and advances the date when the email fails', async () => {
    const schedule = await addSchedule('2026-06-15', { autoSend: true })
    const resend = fakeResend(422)
    const result = await runRecurringSchedules(db, deps(resend.fetcher), now)
    expect(result).toEqual({ created: 1, sent: 0, failed: 1 })
    expect((await allInvoices())[0].status).toBe('draft')
    expect((await scheduleOf(schedule.id)).nextRunDate).toBe('2026-07-15')
    const [log] = await db.select().from(schema.emailLog)
    expect(log.status).toBe('failed')
  })
})

describe('runDailyJobs', () => {
  it('runs the recurring step', async () => {
    await addSchedule('2026-06-15')
    const result = await runDailyJobs(env(), now)
    expect(result.recurringCreated).toBe(1)
  })
})
