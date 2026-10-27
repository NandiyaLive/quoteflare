import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb, schema, type Db } from '#/db'
import { createTestD1 } from '#/db/test-db'
import { createId } from '#/lib/id'
import { runDailyJobs } from './daily'

let db: Db
let d1: D1Database
let dispose: () => Promise<void>
let clientId: string
let counter = 0

beforeAll(async () => {
  const test = await createTestD1()
  d1 = test.d1
  db = createDb(d1)
  dispose = test.dispose
})

afterAll(() => dispose())

const now = new Date('2026-06-15T03:30:00Z')
const env = (apiKey = 're_test') => ({
  DB: d1,
  RESEND_API_KEY: apiKey,
  EMAIL_FROM: 'Invoices <invoices@example.test>',
  APP_ORIGIN: 'https://invoices.example.test',
})

type Sent = { to: string[]; subject: string; text: string; key: string }

function fakeResend(options: { failFor?: string } = {}) {
  const sent: Sent[] = []
  const fetcher = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    const key = (init.headers as Record<string, string>)['Idempotency-Key']
    if (options.failFor && body.to[0] === options.failFor) {
      return Response.json({ message: 'rejected' }, { status: 422 })
    }
    sent.push({ to: body.to, subject: body.subject, text: body.text, key })
    return Response.json({ id: `re_${sent.length}` })
  }) as typeof fetch
  return { sent, fetcher }
}

async function setReminders(on: boolean) {
  await db.delete(schema.settings)
  await db.insert(schema.settings).values({
    id: 'main',
    businessName: 'Studio',
    currency: 'LKR',
    sendReminders: on,
  })
}

beforeEach(async () => {
  counter = 0
  await db.delete(schema.emailLog)
  await db.delete(schema.invoiceItems)
  await db.delete(schema.invoices)
  await db.delete(schema.clients)
  const [client] = await db
    .insert(schema.clients)
    .values({ name: 'Acme', email: 'client@example.test' })
    .returning()
  clientId = client.id
  await setReminders(true)
})

async function addInvoice(
  status: (typeof schema.invoices.$inferInsert)['status'],
  dueDate: string,
  overrides: { clientId?: string } = {},
) {
  const number = `R-${++counter}`
  const [row] = await db
    .insert(schema.invoices)
    .values({
      number,
      clientId: overrides.clientId ?? clientId,
      status,
      issueDate: '2026-05-01',
      dueDate,
      currency: 'LKR',
      publicToken: status === 'draft' ? null : createId(),
    })
    .returning()
  await db.insert(schema.invoiceItems).values({
    invoiceId: row.id,
    description: 'Work',
    quantity: 1,
    unitPrice: 10000,
  })
  return row
}

const logFor = (invoiceId: string) =>
  db
    .select()
    .from(schema.emailLog)
    .where(eq(schema.emailLog.invoiceId, invoiceId))

describe('automatic reminders', () => {
  it('sends nothing while the toggle is off', async () => {
    await setReminders(false)
    await addInvoice('sent', '2026-06-17')
    const { sent, fetcher } = fakeResend()

    const result = await runDailyJobs(env(), now, fetcher)

    expect(result.remindersSent).toBe(0)
    expect(sent).toHaveLength(0)
    expect(await db.select().from(schema.emailLog)).toHaveLength(0)
  })

  it('sends one email of the right type at each stage', async () => {
    const dueSoon = await addInvoice('sent', '2026-06-18')
    const overdue3 = await addInvoice('overdue', '2026-06-12')
    const overdue10 = await addInvoice('overdue', '2026-06-05')
    const { sent, fetcher } = fakeResend()

    const result = await runDailyJobs(env(), now, fetcher)

    expect(result).toMatchObject({ remindersSent: 3, remindersFailed: 0 })
    expect(sent).toHaveLength(3)
    for (const [invoice, type] of [
      [dueSoon, 'due_soon'],
      [overdue3, 'overdue_3'],
      [overdue10, 'overdue_10'],
    ] as const) {
      const logs = await logFor(invoice.id)
      expect(logs).toHaveLength(1)
      expect(logs[0]).toMatchObject({
        type,
        status: 'sent',
        toAddress: 'client@example.test',
      })
      expect(logs[0].providerId).toMatch(/^re_/)
      const [row] = await db
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.id, invoice.id))
      expect(row.lastReminderAt).toBe(now.toISOString())
    }
    expect(sent.map((s) => s.subject).sort()).toEqual([
      'Invoice R-2 is overdue',
      'Reminder: invoice R-1 is due on 2026-06-18',
      'Second reminder: invoice R-3 is overdue',
    ])
  })

  it('links to the public invoice and shows the amount', async () => {
    const invoice = await addInvoice('sent', '2026-06-17')
    const { sent, fetcher } = fakeResend()
    await runDailyJobs(env(), now, fetcher)
    expect(sent[0].text).toContain(
      `https://invoices.example.test/i/${invoice.publicToken}`,
    )
    expect(sent[0].text).toContain('100.00')
  })

  it('sends nothing on a second run', async () => {
    await addInvoice('sent', '2026-06-17')
    await addInvoice('overdue', '2026-06-12')
    const { sent, fetcher } = fakeResend()

    await runDailyJobs(env(), now, fetcher)
    const second = await runDailyJobs(env(), now, fetcher)

    expect(second.remindersSent).toBe(0)
    expect(sent).toHaveLength(2)
    expect(await db.select().from(schema.emailLog)).toHaveLength(2)
  })

  it('does not repeat a reminder a later day when it was already sent', async () => {
    await addInvoice('sent', '2026-06-17')
    const { sent, fetcher } = fakeResend()
    await runDailyJobs(env(), now, fetcher)
    await runDailyJobs(env(), new Date('2026-06-16T03:30:00Z'), fetcher)
    expect(sent).toHaveLength(1)
  })

  it('stops a repeat after the provider status moves past sent', async () => {
    const invoice = await addInvoice('sent', '2026-06-17')
    const { sent, fetcher } = fakeResend()
    await runDailyJobs(env(), now, fetcher)
    await db
      .update(schema.emailLog)
      .set({ status: 'delivered' })
      .where(eq(schema.emailLog.invoiceId, invoice.id))
    await runDailyJobs(env(), now, fetcher)
    expect(sent).toHaveLength(1)
  })

  it('caps a run at 40 emails and sends the rest on the next run', async () => {
    for (let i = 0; i < 60; i++) {
      const [client] = await db
        .insert(schema.clients)
        .values({ name: `C${i}`, email: `c${i}@example.test` })
        .returning()
      await addInvoice('sent', '2026-06-17', { clientId: client.id })
    }
    const { sent, fetcher } = fakeResend()

    const first = await runDailyJobs(env(), now, fetcher)
    expect(first.remindersSent).toBe(40)
    expect(sent).toHaveLength(40)

    const second = await runDailyJobs(env(), now, fetcher)
    expect(second.remindersSent).toBe(20)
    expect(sent).toHaveLength(60)
    expect(new Set(sent.map((s) => s.to[0])).size).toBe(60)

    const third = await runDailyJobs(env(), now, fetcher)
    expect(third.remindersSent).toBe(0)
  })

  it('picks up an invoice left over by the cap on a later day', async () => {
    const early = await addInvoice('sent', '2026-06-16')
    const { sent, fetcher } = fakeResend()
    await runDailyJobs(env(), new Date('2026-06-14T03:30:00Z'), fetcher)
    expect(sent).toHaveLength(1)
    expect((await logFor(early.id))[0].type).toBe('due_soon')
  })

  it('never reminds draft, paid or void invoices', async () => {
    const ids = [
      await addInvoice('draft', '2026-06-17'),
      await addInvoice('paid', '2026-06-17'),
      await addInvoice('void', '2026-06-17'),
      await addInvoice('paid', '2026-06-01'),
      await addInvoice('void', '2026-06-01'),
    ]
    const { sent, fetcher } = fakeResend()
    const result = await runDailyJobs(env(), now, fetcher)
    expect(result.remindersSent).toBe(0)
    expect(sent).toHaveLength(0)
    for (const invoice of ids) expect(await logFor(invoice.id)).toHaveLength(0)
  })

  it('skips invoices outside every window', async () => {
    await addInvoice('sent', '2026-06-19')
    await addInvoice('overdue', '2026-06-14')
    await addInvoice('overdue', '2026-06-13')
    const { sent, fetcher } = fakeResend()
    await runDailyJobs(env(), now, fetcher)
    expect(sent).toHaveLength(0)
  })

  it('logs a failed send, leaves last_reminder_at empty and retries later', async () => {
    const invoice = await addInvoice('sent', '2026-06-17')
    const failing = fakeResend({ failFor: 'client@example.test' })

    const first = await runDailyJobs(env(), now, failing.fetcher)
    expect(first).toMatchObject({ remindersSent: 0, remindersFailed: 1 })
    let logs = await logFor(invoice.id)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ status: 'failed' })
    expect(logs[0].error).toContain('rejected')
    const [row] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, invoice.id))
    expect(row.lastReminderAt).toBeNull()

    const working = fakeResend()
    const retry = await runDailyJobs(env(), now, working.fetcher)
    expect(retry.remindersSent).toBe(1)
    logs = await logFor(invoice.id)
    expect(logs.map((l) => l.status).sort()).toEqual(['failed', 'sent'])
  })

  it('skips an invoice whose client has no valid email', async () => {
    const [noEmail] = await db
      .insert(schema.clients)
      .values({ name: 'No email', email: '' })
      .returning()
    await addInvoice('sent', '2026-06-17', { clientId: noEmail.id })
    const { sent, fetcher } = fakeResend()
    const result = await runDailyJobs(env(), now, fetcher)
    expect(result.remindersSent).toBe(0)
    expect(sent).toHaveLength(0)
  })

  it('does not resend while a pending log row from an interrupted run exists', async () => {
    const invoice = await addInvoice('sent', '2026-06-17')
    await db.insert(schema.emailLog).values({
      invoiceId: invoice.id,
      type: 'due_soon',
      toAddress: 'client@example.test',
      status: 'pending',
    })
    const { sent, fetcher } = fakeResend()
    await runDailyJobs(env(), now, fetcher)
    expect(sent).toHaveLength(0)
  })

  it('marks overdue first so a lapsed invoice gets the overdue reminder', async () => {
    const invoice = await addInvoice('sent', '2026-06-12')
    const { sent, fetcher } = fakeResend()
    const result = await runDailyJobs(env(), now, fetcher)
    expect(result.markedOverdue).toBe(1)
    expect((await logFor(invoice.id))[0].type).toBe('overdue_3')
    expect(sent).toHaveLength(1)
  })
})
