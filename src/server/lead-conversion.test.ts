import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb, schema, type Db } from '#/db'
import { createTestD1 } from '#/db/test-db'
import { leadClientSchema } from '#/lib/lead-inputs'
import { leadClientPrefill } from '#/lib/leads'
import { quoteCreateForLeadSchema } from '#/lib/quotes'
import { getClientLead, listActiveClients, setClientArchived } from './clients'
import {
  applyLeadAction,
  loadLeadDetail,
  makeClientFromLead,
  saveLead,
} from './leads'
import { createQuote } from './quotes'

let db: Db
let dispose: () => Promise<void>

beforeAll(async () => {
  const test = await createTestD1()
  db = createDb(test.d1)
  dispose = test.dispose
})

afterAll(() => dispose())

beforeEach(async () => {
  await db.delete(schema.leadEvents)
  await db.delete(schema.leads)
  await db.delete(schema.quoteEvents)
  await db.delete(schema.quotes)
  await db.delete(schema.clients)
  await db.delete(schema.settings)
  await db.insert(schema.settings).values({
    id: 'main',
    businessName: 'Acme',
    currency: 'LKR',
    taxRateBps: 1000,
  })
})

const MON = new Date('2026-03-02T03:00:00Z')
const later = (seconds: number) => new Date(MON.getTime() + seconds * 1000)

/** A lead that has replied, the only status that can become a client. */
const repliedLead = async (input = 'https://www.instagram.com/studio_x/') => {
  const saved = await saveLead(db, input, MON, { name: 'Studio X' })
  if (!saved.ok) throw new Error(saved.error)
  const steps = ['mark_messaged', 'replied'] as const
  for (const [index, type] of steps.entries()) {
    const result = await applyLeadAction(
      db,
      { type, id: saved.id },
      later(index + 1),
    )
    if (!result.ok) throw new Error(result.error)
  }
  return saved.id
}

const getLead = async (id: string) =>
  (await db.select().from(schema.leads).where(eq(schema.leads.id, id)))[0]

const clientInput = (leadId: string, name = 'Studio X') =>
  leadClientSchema.parse({
    leadId,
    client: { name, company: '', email: '', address: '', notes: '' },
  })

const quoteInput = (leadId?: string) =>
  quoteCreateForLeadSchema.parse({
    name: 'Studio X',
    email: 'x@example.com',
    items: [
      { description: 'Shoot', quantity: '1', unitPrice: '100', taxable: true },
    ],
    discount: '0',
    adminNote: '',
    leadId,
  })

const eventTypes = async (id: string) =>
  (await loadLeadDetail(db, id, MON))?.events.map((e) => e.type).reverse()

describe('leadClientPrefill', () => {
  const lead = {
    platform: 'instagram' as const,
    handle: 'studio_x',
    profileUrl: 'https://www.instagram.com/studio_x/',
    name: 'Studio X',
    note: 'Wedding photographer',
  }

  it('uses the lead name and records the platform, link and note', () => {
    expect(leadClientPrefill(lead)).toEqual({
      name: 'Studio X',
      company: '',
      email: '',
      address: '',
      notes:
        'Lead from Instagram: https://www.instagram.com/studio_x/\n\nWedding photographer',
    })
  })

  it('falls back to the handle and skips an empty note', () => {
    const prefill = leadClientPrefill({ ...lead, name: ' ', note: '' })
    expect(prefill.name).toBe('studio_x')
    expect(prefill.notes).toBe(
      'Lead from Instagram: https://www.instagram.com/studio_x/',
    )
  })
})

describe('makeClientFromLead', () => {
  it('creates the client and links it to a replied lead', async () => {
    const id = await repliedLead()
    const result = await makeClientFromLead(db, clientInput(id))
    if (!result.ok) throw new Error(result.error)
    const lead = await getLead(id)
    expect(lead).toMatchObject({
      clientId: result.id,
      status: 'replied',
      quoteId: null,
    })
    const client = (await db.select().from(schema.clients))[0]
    expect(client).toMatchObject({ id: result.id, name: 'Studio X' })
    expect((await getClientLead(db, result.id))?.id).toBe(id)
  })

  it('refuses a lead that has not replied and creates no client', async () => {
    const saved = await saveLead(db, '@studio_x', MON)
    if (!saved.ok) throw new Error(saved.error)
    expect(await makeClientFromLead(db, clientInput(saved.id))).toMatchObject({
      ok: false,
    })
    expect(await db.select().from(schema.clients)).toHaveLength(0)
  })

  it('refuses a second client for the same lead', async () => {
    const id = await repliedLead()
    await makeClientFromLead(db, clientInput(id))
    expect(
      await makeClientFromLead(db, clientInput(id, 'Other')),
    ).toMatchObject({ ok: false })
    expect(await db.select().from(schema.clients)).toHaveLength(1)
  })

  it('refuses a lead that does not exist', async () => {
    expect(await makeClientFromLead(db, clientInput('missing'))).toMatchObject({
      ok: false,
    })
    expect(await db.select().from(schema.clients)).toHaveLength(0)
  })
})

describe('creating a quote for a lead', () => {
  it('ends with a client, a quote and a won lead that has both IDs', async () => {
    const id = await repliedLead()
    const client = await makeClientFromLead(db, clientInput(id))
    if (!client.ok) throw new Error(client.error)

    const quote = await createQuote(db, quoteInput(id), later(10))
    if (!quote.ok) throw new Error(quote.error)

    expect(await getLead(id)).toMatchObject({
      status: 'won',
      nextActionOn: null,
      clientId: client.id,
      quoteId: quote.id,
    })
    expect(await eventTypes(id)).toEqual([
      'saved',
      'messaged',
      'replied',
      'won',
    ])
    const detail = await loadLeadDetail(db, id, MON)
    expect(detail?.client).toMatchObject({ id: client.id, name: 'Studio X' })
    expect(detail?.quote).toMatchObject({ id: quote.id, number: 'QUO-0001' })
  })

  it('leaves the lead replied when the quote is never created', async () => {
    const id = await repliedLead()
    await makeClientFromLead(db, clientInput(id))
    expect(await getLead(id)).toMatchObject({
      status: 'replied',
      quoteId: null,
    })
    expect(await db.select().from(schema.quotes)).toHaveLength(0)
  })

  it('refuses a lead without a client and creates no quote', async () => {
    const id = await repliedLead()
    expect(await createQuote(db, quoteInput(id), MON)).toMatchObject({
      ok: false,
    })
    expect(await db.select().from(schema.quotes)).toHaveLength(0)
    expect((await getLead(id)).status).toBe('replied')
  })

  it('refuses a lead that already has a quote', async () => {
    const id = await repliedLead()
    await makeClientFromLead(db, clientInput(id))
    await createQuote(db, quoteInput(id), MON)
    expect(await createQuote(db, quoteInput(id), MON)).toMatchObject({
      ok: false,
    })
    expect(await db.select().from(schema.quotes)).toHaveLength(1)
  })

  it('refuses a lead that is not replied', async () => {
    const id = await repliedLead()
    await makeClientFromLead(db, clientInput(id))
    await applyLeadAction(
      db,
      { type: 'close', id, reason: 'not_interested' },
      MON,
    )
    expect(await createQuote(db, quoteInput(id), MON)).toMatchObject({
      ok: false,
    })
    expect(await db.select().from(schema.quotes)).toHaveLength(0)
  })

  it('creates a plain quote without a lead and leaves leads alone', async () => {
    const id = await repliedLead()
    const quote = await createQuote(db, quoteInput(), MON)
    expect(quote.ok).toBe(true)
    expect(await getLead(id)).toMatchObject({
      status: 'replied',
      quoteId: null,
    })
  })
})

describe('archiving the client', () => {
  it('leaves the lead and its history intact', async () => {
    const id = await repliedLead()
    const client = await makeClientFromLead(db, clientInput(id))
    if (!client.ok) throw new Error(client.error)
    const quote = await createQuote(db, quoteInput(id), later(10))
    if (!quote.ok) throw new Error(quote.error)

    expect(await setClientArchived(db, client.id, true)).toBe(true)

    expect(await listActiveClients(db)).toHaveLength(0)
    expect(await getLead(id)).toMatchObject({
      status: 'won',
      clientId: client.id,
      quoteId: quote.id,
    })
    expect(await eventTypes(id)).toEqual([
      'saved',
      'messaged',
      'replied',
      'won',
    ])
    const detail = await loadLeadDetail(db, id, MON)
    expect(detail?.client).toMatchObject({ id: client.id, archived: true })
  })
})
