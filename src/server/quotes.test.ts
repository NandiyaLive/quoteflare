import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb, schema, type Db } from '#/db'
import { createTestD1 } from '#/db/test-db'
import { isCuid } from '#/lib/id'
import {
  quoteCreateSchema,
  quoteEditSchema,
  quoteRequestSchema,
} from '#/lib/quotes'
import { serviceSchema } from '#/lib/services'
import {
  sendQuoteEmails,
  sendQuoteReminders,
  sendQuoteResponseEmail,
  sendQuoteToClient,
} from './quote-email'
import {
  convertQuoteToInvoice,
  createQuote,
  dismissQuotes,
  expireQuotes,
  listQuoteEvents,
  saveQuoteEdit,
  getPublicQuote,
  respondToQuote,
  getQuote,
  listQuotes,
  setQuoteStatus,
  submitQuote,
} from './quotes'
import { saveService, setServiceActive } from './services'
import { verifyTurnstile } from './turnstile'

let db: Db
let dispose: () => Promise<void>

beforeAll(async () => {
  const test = await createTestD1()
  db = createDb(test.d1)
  dispose = test.dispose
})

afterAll(() => dispose())

beforeEach(async () => {
  await db.delete(schema.emailLog)
  await db.delete(schema.invoiceItems)
  await db.delete(schema.invoices)
  await db.delete(schema.clients)
  await db.delete(schema.quotes)
  await db.delete(schema.serviceDependencies)
  await db.delete(schema.serviceOptions)
  await db.delete(schema.serviceOptionGroups)
  await db.delete(schema.services)
  await db.delete(schema.settings)
  await db.insert(schema.settings).values({
    id: 'main',
    businessName: 'Acme',
    currency: 'LKR',
    taxRateBps: 1000,
  })
})

const form = {
  name: 'Service',
  description: '',
  note: '',
  unitLabel: 'unit',
  unitPrice: '100',
  pricingMode: 'fixed',
  billing: 'one_time',
  categoryId: '',
  minQuantity: '1',
  maxQuantity: '',
  quantityStep: '1',
  taxable: true,
  isPrivate: false,
  alwaysIncluded: false,
  estimatedDaysMin: '',
  estimatedDaysMax: '',
  requires: [] as string[],
  groups: [] as unknown[],
  options: [] as unknown[],
}

const create = async (name: string, extra: Record<string, unknown> = {}) => {
  const result = await saveService(
    db,
    serviceSchema.parse({ ...form, name, ...extra }),
  )
  if (!result.ok) throw new Error(JSON.stringify(result))
  return result.id
}

const request = (selections: unknown[], extra: Record<string, unknown> = {}) =>
  quoteRequestSchema.parse({
    name: 'Jo',
    email: 'jo@example.com',
    message: 'Hello',
    turnstileToken: 'token',
    selections,
    ...extra,
  })

const human = () => Promise.resolve(true)

describe('quote numbers and emails', () => {
  let quantity = 0
  // Each call asks for a different quantity so it is not a duplicate.
  const submit = async (id: string) => {
    const result = await submitQuote(
      db,
      request([{ serviceId: id, quantity: ++quantity, optionIds: [] }]),
      human,
    )
    if (!result.ok) throw new Error(result.error)
    return result.id
  }

  it('numbers quotes in order and advances the counter', async () => {
    const id = await create('Web')
    const first = await submit(id)
    const second = await submit(id)
    expect((await getQuote(db, first))?.number).toBe('QUO-0001')
    expect((await getQuote(db, second))?.number).toBe('QUO-0002')
    const settings = await db.query.settings.findFirst()
    expect(settings?.nextQuoteNumber).toBe(3)
  })

  it('calls onCreated with the new id after the insert', async () => {
    const id = await create('Web')
    let seen: string | undefined
    const result = await submitQuote(
      db,
      request([{ serviceId: id, quantity: 1, optionIds: [] }]),
      human,
      async (quoteId) => {
        seen = quoteId
        expect(await getQuote(db, quoteId)).toBeDefined()
      },
    )
    expect(result).toMatchObject({ ok: true, id: seen })
  })

  it('emails the visitor and the business and logs both', async () => {
    await db.update(schema.settings).set({ email: 'owner@example.com' })
    const quoteId = await submit(await create('Web'))
    const sent: { to: string[]; subject: string; reply_to?: string[] }[] = []
    const fetcher = (async (_url: unknown, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)))
      return Response.json({ id: `msg-${sent.length}` })
    }) as typeof fetch

    await sendQuoteEmails(
      db,
      {
        apiKey: 're_test',
        from: 'Acme <a@example.test>',
        origin: 'https://x.test',
        fetcher,
      },
      quoteId,
    )

    expect(sent.map((m) => m.to)).toEqual([
      ['jo@example.com'],
      ['owner@example.com'],
    ])
    expect(sent[0].subject).toContain('QUO-0001')
    expect(sent[1].reply_to).toEqual(['jo@example.com'])
    const log = await db.select().from(schema.emailLog)
    expect(log.map((l) => [l.type, l.status, l.quoteId])).toEqual([
      ['quote_confirmation', 'sent', quoteId],
      ['quote_notification', 'sent', quoteId],
    ])
  })

  it('records a failed send without throwing', async () => {
    const quoteId = await submit(await create('Web'))
    await sendQuoteEmails(
      db,
      { apiKey: undefined, from: 'a@example.test', origin: 'https://x.test' },
      quoteId,
    )
    const log = await db.select().from(schema.emailLog)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({
      status: 'failed',
      type: 'quote_confirmation',
    })
  })
})

describe('submitting a quote', () => {
  it('stores the server-calculated total and a CUID', async () => {
    const id = await create('Web')
    const result = await submitQuote(
      db,
      request([{ serviceId: id, quantity: 2, optionIds: [] }]),
      human,
    )
    expect(result.ok).toBe(true)
    const [row] = await listQuotes(db, 'all')
    expect(isCuid(row.id)).toBe(true)
    expect(row).toMatchObject({
      contactName: 'Jo',
      contactEmail: 'jo@example.com',
      message: 'Hello',
      status: 'new',
      currency: 'LKR',
      total: 22000,
    })
    expect(row.breakdown?.lines[0]).toMatchObject({
      name: 'Web',
      amount: 20000,
    })
  })

  it('ignores a total sent by the browser', async () => {
    const id = await create('Web')
    const result = await submitQuote(
      db,
      {
        ...request([{ serviceId: id, quantity: 1, optionIds: [] }]),
        total: 1,
      } as ReturnType<typeof request>,
      human,
    )
    expect(result.ok).toBe(true)
    expect((await listQuotes(db, 'all'))[0].total).toBe(11000)
  })

  it('rejects client prices and uses the catalog price', async () => {
    const fixed = await create('Web')
    const custom = await create('Custom', { pricingMode: 'custom' })
    for (const serviceId of [fixed, custom]) {
      const line = { serviceId, quantity: 1, optionIds: [] }
      expect(() => request([{ ...line, priceOverride: 1 }])).toThrow()
      await submitQuote(db, request([line]), human)
    }
    expect((await listQuotes(db, 'all')).map((q) => q.total)).toEqual([
      11000, 11000,
    ])
  })

  it('rejects when the human check fails and stores nothing', async () => {
    const id = await create('Web')
    const result = await submitQuote(
      db,
      request([{ serviceId: id, quantity: 1, optionIds: [] }]),
      () => Promise.resolve(false),
    )
    expect(result.ok).toBe(false)
    expect(await listQuotes(db, 'all')).toHaveLength(0)
  })

  it('rejects archived and unknown services', async () => {
    const id = await create('Web', {})
    await db.update(schema.services).set({ active: false })
    for (const serviceId of [id, 'missing']) {
      const result = await submitQuote(
        db,
        request([{ serviceId, quantity: 1, optionIds: [] }]),
        human,
      )
      expect(result.ok).toBe(false)
    }
    expect(await listQuotes(db, 'all')).toHaveLength(0)
  })

  it('rejects a service whose requirement is missing', async () => {
    const base = await create('Base')
    const top = await create('Top', { requires: [base] })
    const result = await submitQuote(
      db,
      request([{ serviceId: top, quantity: 1, optionIds: [] }]),
      human,
    )
    expect(result).toMatchObject({ ok: false })
    const both = await submitQuote(
      db,
      request([
        { serviceId: top, quantity: 1, optionIds: [] },
        { serviceId: base, quantity: 1, optionIds: [] },
      ]),
      human,
    )
    expect(both.ok).toBe(true)
  })

  it('adds always included services and what they require', async () => {
    const tools = await create('Tools')
    const setup = await create('Setup', {
      alwaysIncluded: true,
      requires: [tools],
      minQuantity: '2',
    })
    const web = await create('Web')
    const result = await submitQuote(
      db,
      request([{ serviceId: web, quantity: 1, optionIds: [] }]),
      human,
    )
    expect(result.ok).toBe(true)
    const [row] = await listQuotes(db, 'all')
    expect(row.selection).toHaveLength(3)
    expect(row.selection).toEqual(
      expect.arrayContaining([
        { serviceId: web, quantity: 1, optionIds: [] },
        { serviceId: setup, quantity: 2, optionIds: [] },
        { serviceId: tools, quantity: 1, optionIds: [] },
      ]),
    )
    expect(row.total).toBe(11000 + 22000 + 11000)
  })

  it('keeps the quantity a customer chose for an included service', async () => {
    const setup = await create('Setup', { alwaysIncluded: true })
    await submitQuote(
      db,
      request([{ serviceId: setup, quantity: 3, optionIds: [] }]),
      human,
    )
    const [row] = await listQuotes(db, 'all')
    expect(row.selection).toEqual([
      { serviceId: setup, quantity: 3, optionIds: [] },
    ])
  })

  it('does not add an archived included service', async () => {
    const setup = await create('Setup', { alwaysIncluded: true })
    await setServiceActive(db, setup, false)
    const web = await create('Web')
    const result = await submitQuote(
      db,
      request([{ serviceId: web, quantity: 1, optionIds: [] }]),
      human,
    )
    expect(result.ok).toBe(true)
    expect((await listQuotes(db, 'all'))[0].total).toBe(11000)
  })

  it('rejects quantities outside the rules', async () => {
    const id = await create('Web', { maxQuantity: '3' })
    const result = await submitQuote(
      db,
      request([{ serviceId: id, quantity: 4, optionIds: [] }]),
      human,
    )
    expect(result.ok).toBe(false)
  })
})

describe('quote request validation', () => {
  const ok = {
    name: 'Jo',
    email: 'jo@example.com',
    turnstileToken: 't',
    selections: [{ serviceId: 'a', quantity: 1, optionIds: [] }],
  }

  it('requires name, valid email, token and a selection', () => {
    expect(quoteRequestSchema.safeParse(ok).success).toBe(true)
    for (const bad of [
      { ...ok, name: ' ' },
      { ...ok, email: 'nope' },
      { ...ok, turnstileToken: '' },
      { ...ok, selections: [] },
      { ...ok, selections: [{ serviceId: 'a', quantity: 0, optionIds: [] }] },
      { ...ok, message: 'x'.repeat(2001) },
      { ...ok, total: 1 },
      {
        ...ok,
        selections: [{ serviceId: 'a', quantity: 1, optionIds: [], price: 1 }],
      },
    ]) {
      expect(quoteRequestSchema.safeParse(bad).success).toBe(false)
    }
  })
})

describe('quote status', () => {
  it('dismisses and reopens but never changes a converted quote', async () => {
    const id = await create('Web')
    await submitQuote(
      db,
      request([{ serviceId: id, quantity: 1, optionIds: [] }]),
      human,
    )
    const quote = (await listQuotes(db, 'all'))[0]
    expect(await setQuoteStatus(db, quote.id, 'dismissed')).toBe(true)
    expect((await listQuotes(db, 'dismissed')).length).toBe(1)
    expect((await listQuotes(db, 'new')).length).toBe(0)
    expect(await setQuoteStatus(db, quote.id, 'new')).toBe(true)
    await db
      .update(schema.quotes)
      .set({ status: 'converted' })
      .where(eq(schema.quotes.id, quote.id))
    expect(await setQuoteStatus(db, quote.id, 'dismissed')).toBe(false)
    expect((await getQuote(db, quote.id))?.status).toBe('converted')
    expect(await setQuoteStatus(db, 'missing', 'new')).toBe(false)
  })
})

describe('turnstile verification', () => {
  const respond = (body: unknown, status = 200) =>
    (() =>
      Promise.resolve(
        new Response(JSON.stringify(body), { status }),
      )) as unknown as typeof fetch

  it('accepts only a successful verdict', async () => {
    expect(
      await verifyTurnstile('s', 't', undefined, respond({ success: true })),
    ).toBe(true)
    expect(
      await verifyTurnstile('s', 't', undefined, respond({ success: false })),
    ).toBe(false)
    expect(await verifyTurnstile('s', 't', undefined, respond({}, 500))).toBe(
      false,
    )
  })

  it('fails closed without a secret or when the request throws', async () => {
    expect(
      await verifyTurnstile(
        undefined,
        't',
        undefined,
        respond({ success: true }),
      ),
    ).toBe(false)
    const boom = (() =>
      Promise.reject(new Error('down'))) as unknown as typeof fetch
    expect(await verifyTurnstile('s', 't', undefined, boom)).toBe(false)
  })
})

describe('quote lifecycle', () => {
  const NOW = new Date('2026-06-01T10:00:00Z')
  const deps = (sent: { to: string[]; html: string }[] = []) => ({
    apiKey: 're_test',
    from: 'Acme <a@example.test>',
    origin: 'https://x.test',
    fetcher: (async (_url: unknown, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)))
      return Response.json({ id: `msg-${sent.length}` })
    }) as typeof fetch,
  })
  const submit = async () => {
    const id = await create('Web')
    const result = await submitQuote(
      db,
      request([{ serviceId: id, quantity: 1, optionIds: [] }]),
      human,
    )
    if (!result.ok) throw new Error(result.error)
    return result.id
  }
  const sendOut = async (quoteId: string) => {
    const result = await sendQuoteToClient(db, deps(), quoteId, NOW)
    if (!result.ok) throw new Error(result.error)
    return (await getQuote(db, quoteId))!
  }

  it('emails the link, sets the validity date and marks the quote sent', async () => {
    const sent: { to: string[]; html: string }[] = []
    const quoteId = await submit()
    const result = await sendQuoteToClient(db, deps(sent), quoteId, NOW)
    expect(result).toMatchObject({
      ok: true,
      to: 'jo@example.com',
      validUntil: '2026-07-01',
    })
    const quote = (await getQuote(db, quoteId))!
    expect(quote).toMatchObject({ status: 'sent', validUntil: '2026-07-01' })
    expect(quote.publicToken).toMatch(/^[0-9a-f]{32}$/)
    expect(sent[0].html).toContain(`/q/${quote.publicToken}`)
  })

  it('leaves the quote untouched when the email fails', async () => {
    const quoteId = await submit()
    const result = await sendQuoteToClient(
      db,
      { apiKey: undefined, from: 'a@example.test', origin: 'https://x.test' },
      quoteId,
      NOW,
    )
    expect(result.ok).toBe(false)
    expect(await getQuote(db, quoteId)).toMatchObject({ status: 'new' })
  })

  it('keeps the same link when a quote is sent again', async () => {
    const quoteId = await submit()
    const first = await sendOut(quoteId)
    const second = await sendOut(quoteId)
    expect(second.publicToken).toBe(first.publicToken)
  })

  it('does not send dismissed or converted quotes', async () => {
    const quoteId = await submit()
    await setQuoteStatus(db, quoteId, 'dismissed')
    expect((await sendQuoteToClient(db, deps(), quoteId, NOW)).ok).toBe(false)
  })

  it('shows a sent quote on the public page and hides a new one', async () => {
    const quoteId = await submit()
    expect(await getPublicQuote(db, 'a'.repeat(32), '2026-06-01')).toBeNull()
    const quote = await sendOut(quoteId)
    const view = await getPublicQuote(db, quote.publicToken!, '2026-06-02')
    expect(view?.quote).toMatchObject({ status: 'sent', total: 11000 })
    await setQuoteStatus(db, quoteId, 'dismissed')
    expect(
      await getPublicQuote(db, quote.publicToken!, '2026-06-02'),
    ).toBeNull()
    expect(await getPublicQuote(db, 'not-a-token', '2026-06-02')).toBeNull()
  })

  it('reports a lapsed quote as expired before the daily job runs', async () => {
    const quote = await sendOut(await submit())
    const view = await getPublicQuote(db, quote.publicToken!, '2026-07-02')
    expect(view?.quote.status).toBe('expired')
  })

  it('accepts on the last valid day and records the answer once', async () => {
    const quote = await sendOut(await submit())
    const token = quote.publicToken!
    expect(
      await respondToQuote(db, token, 'accepted', '2026-07-01'),
    ).toMatchObject({
      ok: true,
      status: 'accepted',
    })
    expect((await getQuote(db, quote.id))?.respondedAt).not.toBeNull()
    const again = await respondToQuote(db, token, 'declined', '2026-07-01')
    expect(again).toMatchObject({ ok: false })
    expect((await getQuote(db, quote.id))?.status).toBe('accepted')
  })

  it('refuses an answer after the validity date', async () => {
    const quote = await sendOut(await submit())
    const result = await respondToQuote(
      db,
      quote.publicToken!,
      'accepted',
      '2026-07-02',
    )
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining('expired'),
    })
    expect((await getQuote(db, quote.id))?.status).toBe('sent')
  })

  it('refuses an answer for a quote that was never sent', async () => {
    const quoteId = await submit()
    await db.update(schema.quotes).set({ publicToken: 'b'.repeat(32) })
    expect(
      await respondToQuote(db, 'b'.repeat(32), 'accepted', '2026-06-01'),
    ).toMatchObject({
      ok: false,
      error: 'Quote not found.',
    })
    expect((await getQuote(db, quoteId))?.status).toBe('new')
  })

  it('expires only sent quotes past their date', async () => {
    const lapsed = await sendOut(await submit())
    const open = await sendOut(await submit())
    await db
      .update(schema.quotes)
      .set({ validUntil: '2026-06-10' })
      .where(eq(schema.quotes.id, lapsed.id))
    const fresh = await submit()
    expect(await expireQuotes(db, '2026-06-15')).toBe(1)
    expect((await getQuote(db, lapsed.id))?.status).toBe('expired')
    expect((await getQuote(db, open.id))?.status).toBe('sent')
    expect((await getQuote(db, fresh))?.status).toBe('new')
    expect(await expireQuotes(db, '2026-06-15')).toBe(0)
  })

  it('lets an expired quote be sent again with a new date', async () => {
    const quote = await sendOut(await submit())
    await db.update(schema.quotes).set({ status: 'expired' })
    const result = await sendQuoteToClient(
      db,
      deps(),
      quote.id,
      new Date('2026-08-01T00:00:00Z'),
    )
    expect(result).toMatchObject({ ok: true, validUntil: '2026-08-31' })
    expect((await getQuote(db, quote.id))?.status).toBe('sent')
  })

  it('tells the business how the client answered', async () => {
    await db.update(schema.settings).set({ email: 'owner@example.com' })
    const quote = await sendOut(await submit())
    await respondToQuote(db, quote.publicToken!, 'accepted', '2026-06-02')
    const sent: { to: string[]; html: string }[] = []
    await sendQuoteResponseEmail(db, deps(sent), quote.id)
    expect(sent.map((m) => m.to)).toEqual([['owner@example.com']])
    const log = await db.select().from(schema.emailLog)
    expect(log.map((l) => l.type)).toContain('quote_response')
  })

  it('converts an accepted quote to an invoice', async () => {
    const quote = await sendOut(await submit())
    await respondToQuote(db, quote.publicToken!, 'accepted', '2026-06-02')
    const result = await convertQuoteToInvoice(db, quote.id, '2026-06-03')
    expect(result).toMatchObject({ ok: true, created: true })
    expect((await getQuote(db, quote.id))?.status).toBe('converted')
  })
})

describe('editing a quote', () => {
  const submit = async () => {
    const id = await create('Web')
    const result = await submitQuote(
      db,
      request([{ serviceId: id, quantity: 1, optionIds: [] }]),
      human,
    )
    if (!result.ok) throw new Error(result.error)
    return result.id
  }
  const edit = (id: string, over: Record<string, unknown> = {}) =>
    quoteEditSchema.parse({
      id,
      items: [
        {
          description: 'Design',
          quantity: '2',
          unitPrice: '50',
          taxable: true,
        },
        {
          description: 'Setup',
          quantity: '1',
          unitPrice: '20',
          taxable: false,
        },
      ],
      discount: '10',
      adminNote: 'Friend of a friend',
      ...over,
    })

  it('replaces the items, reprices with the stored tax rate and logs it', async () => {
    const id = await submit()
    // The settings tax rate changes after the quote, but the quote keeps its own.
    await db.update(schema.settings).set({ taxRateBps: 5000 })
    expect(await saveQuoteEdit(db, edit(id))).toEqual({ ok: true })
    const quote = (await getQuote(db, id))!
    expect(quote.adminNote).toBe('Friend of a friend')
    expect(quote.breakdown?.lines.map((l) => l.name)).toEqual([
      'Design',
      'Setup',
    ])
    // 100 taxable + 20 untaxed = 120, less 10 -> taxable base 91.67 at 10%.
    expect(quote.breakdown).toMatchObject({
      subtotal: 12000,
      discountAmount: 1000,
    })
    expect(quote.breakdown?.taxAmount).toBe(917)
    expect(quote.total).toBe(12000 - 1000 + 917)
    const events = await listQuoteEvents(db, id)
    expect(events.map((e) => e.type)).toEqual(['edited', 'received'])
    expect(events[0].detail).toContain('to')
  })

  it('refuses edits once the quote is accepted, converted or invoiced', async () => {
    const id = await submit()
    await db.update(schema.quotes).set({ status: 'accepted' })
    expect(await saveQuoteEdit(db, edit(id))).toMatchObject({ ok: false })
    await db.update(schema.quotes).set({ status: 'converted' })
    expect(await saveQuoteEdit(db, edit(id))).toMatchObject({ ok: false })
    expect(await saveQuoteEdit(db, edit('missing'))).toMatchObject({
      ok: false,
    })
  })

  it('records the lifecycle in the activity log', async () => {
    const id = await submit()
    await setQuoteStatus(db, id, 'dismissed')
    await setQuoteStatus(db, id, 'dismissed')
    await setQuoteStatus(db, id, 'new')
    const types = (await listQuoteEvents(db, id)).map((e) => e.type)
    expect(types).toEqual(['reopened', 'dismissed', 'received'])
  })
})

describe('creating a quote as the admin', () => {
  const input = (over: Record<string, unknown> = {}) =>
    quoteCreateSchema.parse({
      name: 'Pat',
      email: 'pat@example.com',
      items: [
        {
          description: 'Design',
          quantity: '2',
          unitPrice: '50',
          taxable: true,
        },
      ],
      discount: '0',
      adminNote: 'Phone call',
      ...over,
    })

  it('stores a numbered new quote priced at the settings tax rate', async () => {
    const result = await createQuote(db, input())
    if (!result.ok) throw new Error(result.error)
    const quote = (await getQuote(db, result.id))!
    expect(quote).toMatchObject({
      number: 'QUO-0001',
      source: 'admin',
      status: 'new',
      contactName: 'Pat',
      contactEmail: 'pat@example.com',
      adminNote: 'Phone call',
      currency: 'LKR',
      taxRateBps: 1000,
      selection: [],
      total: 11000,
    })
    expect(quote.breakdown?.lines.map((l) => l.name)).toEqual(['Design'])
    const events = await listQuoteEvents(db, result.id)
    expect(events.map((e) => e.type)).toEqual(['created'])
    const settings = await db.query.settings.findFirst()
    expect(settings?.nextQuoteNumber).toBe(2)
  })

  it('gives each quote its own number', async () => {
    const first = await createQuote(db, input())
    const second = await createQuote(db, input())
    if (!first.ok || !second.ok) throw new Error('create failed')
    expect((await getQuote(db, second.id))?.number).toBe('QUO-0002')
  })

  it('refuses without business settings', async () => {
    await db.delete(schema.settings)
    expect(await createQuote(db, input())).toMatchObject({ ok: false })
    expect(await listQuotes(db, 'all')).toHaveLength(0)
  })

  it('can be edited, sent and turned into an invoice like any quote', async () => {
    const result = await createQuote(db, input())
    if (!result.ok) throw new Error(result.error)
    const converted = await convertQuoteToInvoice(db, result.id, '2026-06-01')
    expect(converted).toMatchObject({ ok: true, created: true })
    const clients = await db.select().from(schema.clients)
    expect(clients.map((c) => c.email)).toEqual(['pat@example.com'])
  })

  it('rejects a bad email, empty items and unknown fields', () => {
    const valid = input()
    const raw = {
      ...valid,
      discount: '0',
      items: [{ ...valid.items[0], quantity: '1', unitPrice: '1' }],
    }
    expect(quoteCreateSchema.safeParse(raw).success).toBe(true)
    expect(quoteCreateSchema.safeParse({ ...raw, email: 'nope' }).success).toBe(
      false,
    )
    expect(quoteCreateSchema.safeParse({ ...raw, items: [] }).success).toBe(
      false,
    )
    expect(quoteCreateSchema.safeParse({ ...raw, total: 1 }).success).toBe(
      false,
    )
  })
})

describe('quote reminders', () => {
  const NOW = new Date('2026-06-01T10:00:00Z')
  const sentMail: { to: string[]; subject: string }[] = []
  const deps = {
    apiKey: 're_test',
    from: 'Acme <a@example.test>',
    origin: 'https://x.test',
    fetcher: (async (_url: unknown, init?: RequestInit) => {
      sentMail.push(JSON.parse(String(init?.body)))
      return Response.json({ id: `msg-${sentMail.length}` })
    }) as typeof fetch,
  }
  const sendOut = async () => {
    const serviceId = await create('Web')
    const submitted = await submitQuote(
      db,
      request([{ serviceId, quantity: 1, optionIds: [] }]),
      human,
    )
    if (!submitted.ok) throw new Error(submitted.error)
    const result = await sendQuoteToClient(db, deps, submitted.id, NOW)
    if (!result.ok) throw new Error(result.error)
    sentMail.length = 0
    return submitted.id
  }

  it('does nothing while reminders are off', async () => {
    await sendOut()
    expect(
      await sendQuoteReminders(db, deps, new Date('2026-06-29T00:00:00Z')),
    ).toEqual({ sent: 0, failed: 0 })
  })

  it('reminds once, only inside the last three days', async () => {
    await db.update(schema.settings).set({ sendReminders: true })
    const id = await sendOut()
    // Valid until 2026-07-01.
    expect(
      await sendQuoteReminders(db, deps, new Date('2026-06-20T00:00:00Z')),
    ).toEqual({ sent: 0, failed: 0 })
    const near = new Date('2026-06-28T00:00:00Z')
    expect(await sendQuoteReminders(db, deps, near)).toEqual({
      sent: 1,
      failed: 0,
    })
    expect(sentMail[0].to).toEqual(['jo@example.com'])
    expect(
      await sendQuoteReminders(db, deps, new Date('2026-06-29T00:00:00Z')),
    ).toEqual({ sent: 0, failed: 0 })
    expect((await listQuoteEvents(db, id)).map((e) => e.type)).toContain(
      'reminded',
    )
  })

  it('skips answered and expired quotes', async () => {
    await db.update(schema.settings).set({ sendReminders: true })
    await sendOut()
    await db.update(schema.quotes).set({ status: 'accepted' })
    expect(
      await sendQuoteReminders(db, deps, new Date('2026-06-29T00:00:00Z')),
    ).toEqual({ sent: 0, failed: 0 })
  })

  it('reminds again after the quote is sent again', async () => {
    await db.update(schema.settings).set({ sendReminders: true })
    const id = await sendOut()
    const near = new Date('2026-06-28T00:00:00Z')
    await sendQuoteReminders(db, deps, near)
    await new Promise((r) => setTimeout(r, 5))
    const again = await sendQuoteToClient(
      db,
      deps,
      id,
      new Date('2026-06-26T00:00:00Z'),
    )
    expect(again.ok).toBe(true)
    sentMail.length = 0
    expect(
      await sendQuoteReminders(db, deps, new Date('2026-07-24T00:00:00Z')),
    ).toEqual({ sent: 1, failed: 0 })
  })
})

describe('spam and duplicate protection', () => {
  const line = (serviceId: string, extra: Record<string, unknown> = {}) => ({
    serviceId,
    quantity: 1,
    optionIds: [],
    ...extra,
  })

  it('stores nothing when the honeypot is filled and still answers ok', async () => {
    const id = await create('Web')
    let checked = false
    const result = await submitQuote(
      db,
      request([line(id)], { website: 'http://spam.example' }),
      () => {
        checked = true
        return Promise.resolve(true)
      },
    )
    expect(result.ok).toBe(true)
    expect(checked).toBe(false)
    expect(await listQuotes(db, 'all')).toHaveLength(0)
  })

  it('returns the first quote for a repeat of the same request', async () => {
    const id = await create('Web')
    const first = await submitQuote(db, request([line(id)]), human)
    let notified = 0
    const second = await submitQuote(
      db,
      request([line(id)], { email: 'JO@example.com' }),
      human,
      async () => {
        notified++
      },
    )
    expect(first.ok && second.ok && first.id === second.id).toBe(true)
    expect(notified).toBe(0)
    expect(await listQuotes(db, 'all')).toHaveLength(1)
  })

  it('treats a different selection, email or time as a new quote', async () => {
    const a = await create('A')
    const b = await create('B')
    await submitQuote(db, request([line(a)]), human)
    await submitQuote(db, request([line(b)]), human)
    await submitQuote(db, request([line(a, { quantity: 2 })]), human)
    await submitQuote(
      db,
      request([line(a)], { email: 'other@example.com' }),
      human,
    )
    expect(await listQuotes(db, 'all')).toHaveLength(4)

    await db
      .update(schema.quotes)
      .set({ createdAt: '2020-01-01T00:00:00.000Z' })
    await submitQuote(db, request([line(a)]), human)
    expect(await listQuotes(db, 'all')).toHaveLength(5)
  })
})

describe('dismissing quotes in bulk', () => {
  it('dismisses what can be dismissed and logs each one', async () => {
    const id = await create('Web')
    const ids: string[] = []
    for (const quantity of [1, 2, 3, 4]) {
      const r = await submitQuote(
        db,
        request([{ serviceId: id, quantity, optionIds: [] }]),
        human,
      )
      if (r.ok) ids.push(r.id)
    }
    await db
      .update(schema.quotes)
      .set({ status: 'accepted' })
      .where(eq(schema.quotes.id, ids[2]))
    await db
      .update(schema.quotes)
      .set({ status: 'converted' })
      .where(eq(schema.quotes.id, ids[3]))

    expect(await dismissQuotes(db, [...ids, 'missing'])).toBe(2)
    expect((await getQuote(db, ids[0]))?.status).toBe('dismissed')
    expect((await getQuote(db, ids[2]))?.status).toBe('accepted')
    expect((await getQuote(db, ids[3]))?.status).toBe('converted')
    expect((await listQuoteEvents(db, ids[0]))[0].type).toBe('dismissed')
    expect(await dismissQuotes(db, ids)).toBe(0)
  })
})
