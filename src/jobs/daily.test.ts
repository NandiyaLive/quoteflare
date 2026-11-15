import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
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

  it('expires sent quotes whose validity date has passed', async () => {
    await db.delete(schema.quotes)
    const quote = (valid: string, status: 'sent' | 'new') => ({
      contactName: 'Jo',
      contactEmail: 'jo@example.com',
      selection: [],
      total: 100,
      status,
      validUntil: valid,
    })
    const [lapsed, open, unsent] = await db
      .insert(schema.quotes)
      .values([
        quote('2026-06-14', 'sent'),
        quote('2026-06-15', 'sent'),
        quote('2026-06-01', 'new'),
      ])
      .returning({ id: schema.quotes.id })
    const result = await runDailyJobs(env(), now)
    expect(result.quotesExpired).toBe(1)
    const status = async (id: string) =>
      (await db.select().from(schema.quotes).where(eq(schema.quotes.id, id)))[0]
        .status
    expect(await status(lapsed.id)).toBe('expired')
    expect(await status(open.id)).toBe('sent')
    expect(await status(unsent.id)).toBe('new')
    await db.delete(schema.quotes)
  })

  it('changes nothing on a second run', async () => {
    await addInvoice('A-1', 'sent', '2026-06-14')
    expect((await runDailyJobs(env(), now)).markedOverdue).toBe(1)
    expect((await runDailyJobs(env(), now)).markedOverdue).toBe(0)
  })

  it('logs the error and rethrows when a step fails', async () => {
    const failure = new Error('database unavailable')
    const broken = {
      ...env(),
      DB: {
        prepare: () => {
          throw failure
        },
        batch: () => Promise.reject(failure),
      } as unknown as D1Database,
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(runDailyJobs(broken, now)).rejects.toThrow(
      'database unavailable',
    )
    expect(spy).toHaveBeenCalledWith('daily: job failed', failure)
    spy.mockRestore()
  })
})

describe('lead digest', () => {
  type Sent = { to: string[]; subject: string; text: string }

  const fakeResend = () => {
    const sent: Sent[] = []
    const fetcher = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      sent.push({ to: body.to, subject: body.subject, text: body.text })
      return Response.json({ id: `re_${sent.length}` })
    }) as typeof fetch
    return { sent, fetcher }
  }

  const setDigest = async (on: boolean) => {
    await db.delete(schema.settings)
    await db.insert(schema.settings).values({
      id: 'main',
      businessName: 'Studio',
      email: 'owner@example.test',
      currency: 'LKR',
      sendLeadDigest: on,
    })
  }

  const addLead = (
    handle: string,
    status: (typeof schema.leads.$inferInsert)['status'],
    nextActionOn: string | null,
  ) =>
    db.insert(schema.leads).values({
      platform: 'instagram',
      handle,
      profileUrl: `https://www.instagram.com/${handle}/`,
      profileKey: `instagram:${handle}`,
      status,
      nextActionOn,
    })

  beforeEach(async () => {
    await db.delete(schema.emailLog)
    await db.delete(schema.leads)
    await setDigest(true)
  })

  it('sends one digest with the right counts and handles', async () => {
    await addLead('first_a', 'saved', '2026-06-15')
    await addLead('first_b', 'saved', '2026-06-10')
    await addLead('check_a', 'messaged', '2026-06-15')
    await addLead('later', 'saved', '2026-06-16')
    await addLead('done', 'won', null)
    const { sent, fetcher } = fakeResend()

    const result = await runDailyJobs(env(), now, fetcher)

    expect(result.leadDigestSent).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toEqual(['owner@example.test'])
    expect(sent[0].subject).toBe('3 leads due today')
    expect(sent[0].text).toContain('Send first message (2)')
    expect(sent[0].text).toContain('Check if they saw it (1)')
    expect(sent[0].text).not.toContain('Follow up')
    expect(sent[0].text).toContain('first_a')
    expect(sent[0].text).toContain('first_b')
    expect(sent[0].text).toContain('check_a')
    expect(sent[0].text).not.toContain('later')
    expect(sent[0].text).toContain('https://invoices.example.test/admin/leads')
    const logged = await db.select().from(schema.emailLog)
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatchObject({ type: 'lead_digest', status: 'sent' })
  })

  it('lists at most 10 handles per group and counts the rest', async () => {
    for (let i = 0; i < 12; i++)
      await addLead(`lead_${i}`, 'saved', '2026-06-15')
    const { sent, fetcher } = fakeResend()
    await runDailyJobs(env(), now, fetcher)
    expect(sent[0].text).toContain('Send first message (12)')
    expect(sent[0].text).toContain('and 2 more')
    expect(sent[0].text.match(/lead_\d+/g)).toHaveLength(10)
  })

  it('sends nothing the second time on the same day', async () => {
    await addLead('first_a', 'saved', '2026-06-15')
    const { sent, fetcher } = fakeResend()
    expect((await runDailyJobs(env(), now, fetcher)).leadDigestSent).toBe(true)
    expect((await runDailyJobs(env(), now, fetcher)).leadDigestSent).toBe(false)
    expect(sent).toHaveLength(1)
  })

  it('sends again the next day', async () => {
    await addLead('first_a', 'saved', '2026-06-15')
    const { sent, fetcher } = fakeResend()
    await runDailyJobs(env(), now, fetcher)
    await runDailyJobs(env(), new Date('2026-06-16T03:30:00Z'), fetcher)
    expect(sent).toHaveLength(2)
  })

  it('sends nothing when no lead is due', async () => {
    await addLead('later', 'saved', '2026-06-16')
    await addLead('done', 'closed', null)
    const { sent, fetcher } = fakeResend()
    expect((await runDailyJobs(env(), now, fetcher)).leadDigestSent).toBe(false)
    expect(sent).toHaveLength(0)
    expect(await db.select().from(schema.emailLog)).toHaveLength(0)
  })

  it('sends nothing when the switch is off', async () => {
    await setDigest(false)
    await addLead('first_a', 'saved', '2026-06-15')
    const { sent, fetcher } = fakeResend()
    expect((await runDailyJobs(env(), now, fetcher)).leadDigestSent).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('retries after a failed send but not after a sent one', async () => {
    await addLead('first_a', 'saved', '2026-06-15')
    const failing = (async () =>
      Response.json({ message: 'rejected' }, { status: 422 })) as typeof fetch
    expect((await runDailyJobs(env(), now, failing)).leadDigestSent).toBe(false)
    const { sent, fetcher } = fakeResend()
    expect((await runDailyJobs(env(), now, fetcher)).leadDigestSent).toBe(true)
    expect(sent).toHaveLength(1)
    const statuses = (await db.select().from(schema.emailLog)).map(
      (r) => r.status,
    )
    expect(statuses.sort()).toEqual(['failed', 'sent'])
  })
})
