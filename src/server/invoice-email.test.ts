import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb, schema, type Db } from '#/db'
import { createTestD1 } from '#/db/test-db'
import { buildInvoiceEmail, sendInvoiceEmail } from './invoice-email'

let db: Db
let dispose: () => Promise<void>
let invoiceId: string

beforeAll(async () => {
  const test = await createTestD1()
  db = createDb(test.d1)
  dispose = test.dispose
})

afterAll(() => dispose())

async function seed(clientEmail = 'client@example.com', status = 'draft') {
  await db.delete(schema.emailLog)
  await db.delete(schema.invoiceItems)
  await db.delete(schema.invoices)
  await db.delete(schema.clients)
  await db.delete(schema.settings)
  await db
    .insert(schema.settings)
    .values({ id: 'main', businessName: 'Studio & Co', currency: 'LKR' })
  const [client] = await db
    .insert(schema.clients)
    .values({ name: 'Acme', email: clientEmail })
    .returning()
  const [invoice] = await db
    .insert(schema.invoices)
    .values({
      number: 'INV-2026-0001',
      clientId: client.id,
      status: status as 'draft',
      issueDate: '2026-03-10',
      dueDate: '2026-03-24',
      currency: 'LKR',
      taxRateBps: 1000,
    })
    .returning()
  await db.insert(schema.invoiceItems).values({
    invoiceId: invoice.id,
    description: 'Design',
    quantity: 1,
    unitPrice: 10000,
  })
  invoiceId = invoice.id
}

beforeEach(() => seed())

type Call = { url: string; init: RequestInit }
const stubFetch = (response: Response) => {
  const calls: Call[] = []
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return response.clone()
  }) as unknown as typeof fetch
  return { calls, fetcher }
}

const deps = (fetcher: typeof fetch) => ({
  apiKey: 're_key' as string | undefined,
  from: 'QuoteKit <invoices@example.com>',
  origin: 'https://invoices.example.com',
  fetcher,
})

const logs = () => db.select().from(schema.emailLog)
const invoiceRow = async () =>
  (
    await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, invoiceId))
  )[0]

describe('buildInvoiceEmail', () => {
  const input = {
    businessName: '<b>Studio</b>',
    number: 'INV-1',
    total: 'LKR 110.00',
    dueDate: '2026-03-24',
    url: 'https://x.test/i/abc',
  }

  it('escapes HTML in the business name and keeps the link in both bodies', async () => {
    const email = await buildInvoiceEmail(input)
    expect(email.html).not.toContain('<b>Studio</b>')
    expect(email.html).toContain('&lt;b&gt;Studio&lt;/b&gt;')
    expect(email.text).toContain('https://x.test/i/abc')
    expect(email.html).toContain('href="https://x.test/i/abc"')
  })

  it('fills placeholders in a custom template', async () => {
    const email = await buildInvoiceEmail(input, {
      subject: 'Pay {{total}} by {{dueDate}}',
      body: 'Hello from {{number}}.\n\nThanks!',
      button: 'Pay {{number}}',
    })
    expect(email.subject).toBe('Pay LKR 110.00 by 2026-03-24')
    expect(email.html).toContain('Hello from INV-1.')
    expect(email.html).toContain('Pay INV-1')
  })
})

describe('sendInvoiceEmail', () => {
  it('sends the email, logs it as sent and marks a draft as sent', async () => {
    const { calls, fetcher } = stubFetch(
      Response.json({ id: 'resend_123' }, { status: 200 }),
    )
    const result = await sendInvoiceEmail(db, deps(fetcher), invoiceId)

    expect(result).toEqual({
      ok: true,
      status: 'sent',
      to: 'client@example.com',
    })
    const invoice = await invoiceRow()
    expect(invoice.status).toBe('sent')
    expect(invoice.publicToken).toMatch(/^[0-9a-f]{32}$/)

    const [log] = await logs()
    expect(log).toMatchObject({
      invoiceId,
      type: 'invoice',
      toAddress: 'client@example.com',
      status: 'sent',
      providerId: 'resend_123',
      error: null,
    })

    const sent = JSON.parse(String(calls[0].init.body))
    expect(sent.to).toEqual(['client@example.com'])
    expect(sent.text).toContain(
      `https://invoices.example.com/i/${invoice.publicToken}`,
    )
    expect(sent.subject).toBe('Invoice INV-2026-0001 from Studio & Co')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer re_key')
    expect(headers['Idempotency-Key']).toBe(log.id)
  })

  it('sets reply_to from settings and omits it when blank', async () => {
    await db
      .update(schema.settings)
      .set({ replyToEmail: 'replies@example.com' })
    const withReply = stubFetch(Response.json({ id: 'a' }))
    await sendInvoiceEmail(db, deps(withReply.fetcher), invoiceId)
    expect(JSON.parse(String(withReply.calls[0].init.body)).reply_to).toEqual([
      'replies@example.com',
    ])

    await db.update(schema.settings).set({ replyToEmail: '' })
    const without = stubFetch(Response.json({ id: 'b' }))
    await sendInvoiceEmail(db, deps(without.fetcher), invoiceId)
    expect(JSON.parse(String(without.calls[0].init.body))).not.toHaveProperty(
      'reply_to',
    )
  })

  it('logs a failure and leaves the draft untouched when Resend rejects the key', async () => {
    const { fetcher } = stubFetch(
      Response.json({ message: 'API key is invalid' }, { status: 401 }),
    )
    const result = await sendInvoiceEmail(db, deps(fetcher), invoiceId)

    expect(result.ok).toBe(false)
    const invoice = await invoiceRow()
    expect(invoice.status).toBe('draft')
    expect(invoice.publicToken).toBeNull()
    expect(invoice.sentAt).toBeNull()

    const rows = await logs()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('failed')
    expect(rows[0].providerId).toBeNull()
    expect(rows[0].error).toContain('401')
    expect(rows[0].error).toContain('API key is invalid')
  })

  it('logs a failure when the request throws', async () => {
    const fetcher = (async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    const result = await sendInvoiceEmail(db, deps(fetcher), invoiceId)
    expect(result.ok).toBe(false)
    expect((await logs())[0].error).toContain('network down')
    expect((await invoiceRow()).status).toBe('draft')
  })

  it('fails without calling Resend when the API key is missing', async () => {
    const { calls, fetcher } = stubFetch(Response.json({ id: 'x' }))
    const result = await sendInvoiceEmail(
      db,
      { ...deps(fetcher), apiKey: undefined },
      invoiceId,
    )
    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(0)
    expect((await logs())[0].status).toBe('failed')
    expect((await invoiceRow()).status).toBe('draft')
  })

  it('resends a sent invoice with the same link and keeps its status', async () => {
    const first = stubFetch(Response.json({ id: 'a' }))
    await sendInvoiceEmail(db, deps(first.fetcher), invoiceId)
    const token = (await invoiceRow()).publicToken

    const second = stubFetch(Response.json({ id: 'b' }))
    const result = await sendInvoiceEmail(db, deps(second.fetcher), invoiceId)

    expect(result.ok && result.status).toBe('sent')
    expect(JSON.parse(String(second.calls[0].init.body)).text).toContain(
      `/i/${token}`,
    )
    expect((await invoiceRow()).publicToken).toBe(token)
    expect(await logs()).toHaveLength(2)
  })

  it.each(['paid', 'void'])(
    'refuses a %s invoice and logs nothing',
    async (status) => {
      await seed('client@example.com', status)
      const { calls, fetcher } = stubFetch(Response.json({ id: 'x' }))
      const result = await sendInvoiceEmail(db, deps(fetcher), invoiceId)
      expect(result.ok).toBe(false)
      expect(calls).toHaveLength(0)
      expect(await logs()).toHaveLength(0)
    },
  )

  it.each(['', 'not-an-email'])(
    'refuses a client email of "%s" and logs nothing',
    async (email) => {
      await seed(email)
      const { calls, fetcher } = stubFetch(Response.json({ id: 'x' }))
      const result = await sendInvoiceEmail(db, deps(fetcher), invoiceId)
      expect(result.ok).toBe(false)
      expect(calls).toHaveLength(0)
      expect(await logs()).toHaveLength(0)
      expect((await invoiceRow()).status).toBe('draft')
    },
  )

  it('reports an unknown invoice', async () => {
    const { fetcher } = stubFetch(Response.json({ id: 'x' }))
    const result = await sendInvoiceEmail(db, deps(fetcher), 'missing')
    expect(result).toEqual({ ok: false, error: 'Invoice not found.' })
  })
})
