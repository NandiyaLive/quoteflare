import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb, schema, type Db } from '#/db'
import { createTestD1 } from '#/db/test-db'
import { isCuid } from '#/lib/id'
import {
  computeInvoiceTotals,
  invoiceSchema,
  previewTotals,
  type InvoiceFormValues,
} from '#/lib/invoices'
import {
  changeInvoiceStatus,
  createInvoice,
  getInvoice,
  getPublicInvoice,
  listInvoices,
  updateInvoice,
} from './invoices'

let db: Db
let dispose: () => Promise<void>
let clientId: string

beforeAll(async () => {
  const test = await createTestD1()
  db = createDb(test.d1)
  dispose = test.dispose
})

afterAll(() => dispose())

beforeEach(async () => {
  await db.delete(schema.invoiceItems)
  await db.delete(schema.invoices)
  await db.delete(schema.clients)
  await db.delete(schema.settings)
  await db.insert(schema.settings).values({
    id: 'main',
    businessName: 'Studio',
    currency: 'LKR',
    invoicePrefix: 'INV',
    nextInvoiceNumber: 1,
    taxRateBps: 1000,
  })
  const [client] = await db
    .insert(schema.clients)
    .values({ name: 'Acme' })
    .returning()
  clientId = client.id
})

const form = (extra: Partial<InvoiceFormValues> = {}): InvoiceFormValues => ({
  clientId,
  issueDate: '2026-03-10',
  dueDate: '2026-03-24',
  taxRate: '10',
  discount: '0',
  items: [
    { description: 'Design', quantity: '1', unitPrice: '450.00' },
    { description: 'Build', quantity: '2', unitPrice: '15.50' },
  ],
  ...extra,
})

const data = (extra: Partial<InvoiceFormValues> = {}) =>
  invoiceSchema.parse(form(extra))

describe('invoice validation', () => {
  it('converts decimals to minor units and percent to basis points', () => {
    const parsed = data({ taxRate: '7.5', discount: '12.3' })
    expect(parsed.taxRate).toBe(750)
    expect(parsed.discount).toBe(1230)
    expect(parsed.items.map((i) => i.unitPrice)).toEqual([45000, 1550])
  })

  it.each([
    ['no items', { items: [] }],
    [
      'a blank description',
      { items: [{ description: ' ', quantity: '1', unitPrice: '1' }] },
    ],
    [
      'zero quantity',
      { items: [{ description: 'A', quantity: '0', unitPrice: '1' }] },
    ],
    [
      'a fractional quantity',
      { items: [{ description: 'A', quantity: '1.5', unitPrice: '1' }] },
    ],
    [
      'a negative price',
      { items: [{ description: 'A', quantity: '1', unitPrice: '-5' }] },
    ],
    [
      'a three decimal price',
      { items: [{ description: 'A', quantity: '1', unitPrice: '1.005' }] },
    ],
    ['a tax rate above 100', { taxRate: '101' }],
    ['a text tax rate', { taxRate: 'abc' }],
    ['a negative tax rate', { taxRate: '-5' }],
    ['an impossible date', { issueDate: '2026-02-30' }],
    ['a due date before the issue date', { dueDate: '2026-03-01' }],
    ['no client', { clientId: '' }],
  ] as [string, Partial<InvoiceFormValues>][])('rejects %s', (_, extra) => {
    expect(invoiceSchema.safeParse(form(extra)).success).toBe(false)
  })

  it('rejects unknown fields', () => {
    expect(invoiceSchema.safeParse({ ...form(), status: 'paid' }).success).toBe(
      false,
    )
  })
})

describe('invoice totals', () => {
  it('matches a manual calculation', () => {
    // 1 x 450.00 + 2 x 15.50 = 481.00, less 31.00 = 450.00, tax 45.00.
    expect(
      computeInvoiceTotals(
        [
          { quantity: 1, unitPrice: 45000 },
          { quantity: 2, unitPrice: 1550 },
        ],
        1000,
        3100,
      ),
    ).toEqual({
      subtotal: 48100,
      discountAmount: 3100,
      taxAmount: 4500,
      total: 49500,
    })
  })

  it('caps the discount at the subtotal', () => {
    expect(
      computeInvoiceTotals([{ quantity: 1, unitPrice: 1000 }], 1000, 5000),
    ).toMatchObject({ discountAmount: 1000, taxAmount: 0, total: 0 })
  })

  it('leaves non-taxable lines out of the tax base', () => {
    expect(
      computeInvoiceTotals(
        [
          { quantity: 1, unitPrice: 10000, taxable: true },
          { quantity: 1, unitPrice: 10000, taxable: false },
        ],
        1000,
        0,
      ),
    ).toMatchObject({ subtotal: 20000, taxAmount: 1000, total: 21000 })
    expect(
      previewTotals(
        form({
          items: [
            { description: 'A', quantity: '1', unitPrice: '100' },
            {
              description: 'B',
              quantity: '1',
              unitPrice: '100',
              taxable: false,
            },
          ],
        }),
      ),
    ).toMatchObject({ taxAmount: 1000, total: 21000 })
  })

  it('previews a half-filled form without throwing', () => {
    expect(
      previewTotals(
        form({
          taxRate: '',
          items: [
            { description: '', quantity: '', unitPrice: '' },
            { description: 'A', quantity: '2', unitPrice: '10' },
          ],
        }),
      ),
    ).toMatchObject({ subtotal: 2000, total: 2000 })
  })
})

describe('invoice numbers', () => {
  it('numbers quick successive saves one after another', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => createInvoice(db, data())),
    )
    const numbers = results.map((r) => (r.ok ? r.number : r.error)).sort()
    expect(numbers).toEqual([
      'INV-2026-0001',
      'INV-2026-0002',
      'INV-2026-0003',
      'INV-2026-0004',
      'INV-2026-0005',
      'INV-2026-0006',
      'INV-2026-0007',
      'INV-2026-0008',
    ])
    const settings = await db.query.settings.findFirst()
    expect(settings?.nextInvoiceNumber).toBe(9)
  })

  it('uses the prefix and the year of the issue date', async () => {
    await db
      .update(schema.settings)
      .set({ invoicePrefix: 'QK', nextInvoiceNumber: 42 })
    const result = await createInvoice(
      db,
      data({ issueDate: '2027-01-02', dueDate: '2027-01-16' }),
    )
    expect(result).toMatchObject({ ok: true, number: 'QK-2027-0042' })
  })

  it('does not consume a number when the save fails', async () => {
    await createInvoice(db, data())
    await db.update(schema.settings).set({ nextInvoiceNumber: 1 })
    const clash = await createInvoice(db, data())
    expect(clash.ok).toBe(false)
    const settings = await db.query.settings.findFirst()
    expect(settings?.nextInvoiceNumber).toBe(1)
    const rows = await db.select().from(schema.invoices)
    expect(rows).toHaveLength(1)
    expect(await db.select().from(schema.invoiceItems)).toHaveLength(2)
  })

  it('fails cleanly without a settings row', async () => {
    await db.delete(schema.settings)
    expect(await createInvoice(db, data())).toMatchObject({ ok: false })
  })
})

describe('creating an invoice', () => {
  it('stores a draft with CUID ids, settings currency and ordered items', async () => {
    const result = await createInvoice(
      db,
      data({ taxRate: '15', discount: '5' }),
    )
    if (!result.ok) throw new Error(result.error)
    expect(isCuid(result.id)).toBe(true)

    const detail = await getInvoice(db, result.id)
    expect(detail?.invoice).toMatchObject({
      status: 'draft',
      currency: 'LKR',
      taxRateBps: 1500,
      discount: 500,
      publicToken: null,
      issueDate: '2026-03-10',
      dueDate: '2026-03-24',
    })
    expect(detail?.items.map((i) => i.description)).toEqual(['Design', 'Build'])
    expect(detail?.items.every((i) => isCuid(i.id))).toBe(true)
  })

  it('rejects a missing and an archived client', async () => {
    expect(await createInvoice(db, data({ clientId: 'nope' }))).toMatchObject({
      ok: false,
    })
    await db
      .update(schema.clients)
      .set({ archived: true })
      .where(eq(schema.clients.id, clientId))
    expect(await createInvoice(db, data())).toMatchObject({ ok: false })
    expect(await db.select().from(schema.invoices)).toHaveLength(0)
  })

  it('lists the same totals the detail shows', async () => {
    const result = await createInvoice(db, data({ discount: '31' }))
    if (!result.ok) throw new Error(result.error)
    const [row] = await listInvoices(db)
    const detail = await getInvoice(db, result.id)
    expect(row).toMatchObject({
      number: 'INV-2026-0001',
      clientName: 'Acme',
      subtotal: 48100,
      total: 49500,
    })
    expect(detail?.totals).toMatchObject({ subtotal: 48100, total: 49500 })
  })
})

describe('taxable lines', () => {
  const mixed = {
    items: [
      { description: 'Taxed', quantity: '1', unitPrice: '100' },
      {
        description: 'Exempt',
        quantity: '1',
        unitPrice: '100',
        taxable: false,
      },
    ],
  }

  it('defaults to taxable and keeps the flag through create and edit', async () => {
    expect(data().items.every((i) => i.taxable)).toBe(true)
    const created = await createInvoice(db, data(mixed))
    if (!created.ok) throw new Error(created.error)

    let detail = await getInvoice(db, created.id)
    expect(detail?.items.map((i) => i.taxable)).toEqual([true, false])
    expect(detail?.totals).toMatchObject({ taxAmount: 1000, total: 21000 })

    await updateInvoice(db, created.id, data(mixed))
    detail = await getInvoice(db, created.id)
    expect(detail?.items.map((i) => i.taxable)).toEqual([true, false])
    expect(detail?.totals.total).toBe(21000)
    const listed = (await listInvoices(db)).find((i) => i.id === created.id)
    expect(listed?.total).toBe(21000)
  })
})

describe('editing an invoice', () => {
  it('replaces items and totals on a draft and keeps the number', async () => {
    const created = await createInvoice(db, data())
    if (!created.ok) throw new Error(created.error)

    const result = await updateInvoice(
      db,
      created.id,
      data({
        taxRate: '0',
        discount: '10',
        dueDate: '2026-04-01',
        items: [{ description: 'Only line', quantity: '3', unitPrice: '100' }],
      }),
    )
    expect(result).toMatchObject({ ok: true, number: 'INV-2026-0001' })

    const detail = await getInvoice(db, created.id)
    expect(detail?.items.map((i) => i.description)).toEqual(['Only line'])
    expect(detail?.invoice).toMatchObject({
      dueDate: '2026-04-01',
      discount: 1000,
    })
    expect(detail?.totals).toMatchObject({ subtotal: 30000, total: 29000 })
    expect((await db.select().from(schema.settings))[0].nextInvoiceNumber).toBe(
      2,
    )
  })

  it.each(['sent', 'paid', 'overdue', 'void'] as const)(
    'rejects an edit of a %s invoice and leaves it unchanged',
    async (status) => {
      const created = await createInvoice(db, data())
      if (!created.ok) throw new Error(created.error)
      await db
        .update(schema.invoices)
        .set({ status })
        .where(eq(schema.invoices.id, created.id))

      const result = await updateInvoice(
        db,
        created.id,
        data({
          items: [{ description: 'Changed', quantity: '9', unitPrice: '9' }],
        }),
      )
      expect(result).toEqual({
        ok: false,
        error: 'Only draft invoices can be edited.',
      })
      const detail = await getInvoice(db, created.id)
      expect(detail?.items.map((i) => i.description)).toEqual([
        'Design',
        'Build',
      ])
    },
  )

  it('rejects an unknown invoice', async () => {
    expect(await updateInvoice(db, 'missing', data())).toMatchObject({
      ok: false,
    })
  })

  it('keeps an archived client already on the invoice but blocks switching to one', async () => {
    const created = await createInvoice(db, data())
    if (!created.ok) throw new Error(created.error)
    await db
      .update(schema.clients)
      .set({ archived: true })
      .where(eq(schema.clients.id, clientId))
    expect(await updateInvoice(db, created.id, data())).toMatchObject({
      ok: true,
    })

    const [other] = await db
      .insert(schema.clients)
      .values({ name: 'Other', archived: true })
      .returning()
    expect(
      await updateInvoice(db, created.id, data({ clientId: other.id })),
    ).toMatchObject({ ok: false })
  })
})

describe('status workflow', () => {
  const create = async () => {
    const result = await createInvoice(db, data())
    if (!result.ok) throw new Error(result.error)
    return result.id
  }
  const statusOf = async (id: string) => (await getInvoice(db, id))!.invoice

  it('creates no public token for a draft', async () => {
    const id = await create()
    expect((await statusOf(id)).publicToken).toBeNull()
  })

  it('issues a 32 character token when first sent and keeps it after undo', async () => {
    const id = await create()
    const sent = await changeInvoiceStatus(db, id, 'sent')
    expect(sent.ok && sent.publicToken).toMatch(/^[0-9a-f]{32}$/)
    const token = sent.ok ? sent.publicToken : null
    expect((await statusOf(id)).sentAt).not.toBeNull()

    expect((await changeInvoiceStatus(db, id, 'paid')).ok).toBe(true)
    const undone = await changeInvoiceStatus(db, id, 'sent')
    expect(undone.ok && undone.publicToken).toBe(token)
  })

  it.each([
    ['draft', 'paid'],
    ['draft', 'overdue'],
    ['draft', 'draft'],
    ['sent', 'draft'],
    ['overdue', 'sent'],
    ['paid', 'draft'],
    ['paid', 'void'],
    ['paid', 'overdue'],
    ['void', 'sent'],
    ['void', 'draft'],
  ] as const)('rejects %s to %s', async (from, to) => {
    const id = await create()
    await db
      .update(schema.invoices)
      .set({ status: from })
      .where(eq(schema.invoices.id, id))
    const result = await changeInvoiceStatus(db, id, to)
    expect(result.ok).toBe(false)
    expect((await statusOf(id)).status).toBe(from)
  })

  it.each([
    ['draft', 'sent'],
    ['draft', 'void'],
    ['sent', 'paid'],
    ['sent', 'overdue'],
    ['sent', 'void'],
    ['overdue', 'paid'],
    ['overdue', 'void'],
    ['paid', 'sent'],
  ] as const)('allows %s to %s', async (from, to) => {
    const id = await create()
    await db
      .update(schema.invoices)
      .set({ status: from })
      .where(eq(schema.invoices.id, id))
    expect((await changeInvoiceStatus(db, id, to)).ok).toBe(true)
    expect((await statusOf(id)).status).toBe(to)
  })

  it('does not issue a token for draft to void', async () => {
    const id = await create()
    await changeInvoiceStatus(db, id, 'void')
    expect((await statusOf(id)).publicToken).toBeNull()
  })

  it('rejects an unknown invoice', async () => {
    expect((await changeInvoiceStatus(db, 'missing', 'sent')).ok).toBe(false)
  })

  it('serves a public invoice only for a sent token', async () => {
    const id = await create()
    expect(await getPublicInvoice(db, 'a'.repeat(32))).toBeNull()
    const sent = await changeInvoiceStatus(db, id, 'sent')
    const token = sent.ok ? sent.publicToken! : ''
    const view = await getPublicInvoice(db, token)
    expect(view?.items).toHaveLength(2)
    expect(view?.totals.total).toBe((await getInvoice(db, id))!.totals.total)
    expect(view?.business.name).toBe('Studio')
    expect(await getPublicInvoice(db, 'a'.repeat(32))).toBeNull()
    expect(await getPublicInvoice(db, 'short')).toBeNull()
    expect(await getPublicInvoice(db, token.toUpperCase())).toBeNull()
  })

  it('hides a public invoice that goes back to draft', async () => {
    const id = await create()
    const sent = await changeInvoiceStatus(db, id, 'sent')
    const token = sent.ok ? sent.publicToken! : ''
    await db
      .update(schema.invoices)
      .set({ status: 'draft' })
      .where(eq(schema.invoices.id, id))
    expect(await getPublicInvoice(db, token)).toBeNull()
  })
})
