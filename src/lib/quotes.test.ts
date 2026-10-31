import { describe, expect, it } from 'vitest'
import { quoteEditSchema, quotesToCsv, repriceQuote } from './quotes'

const parse = (items: unknown[], discount = '0') =>
  quoteEditSchema.parse({ id: 'q1', items, discount, adminNote: '' })

const item = (over: Record<string, unknown> = {}) => ({
  description: 'Logo',
  quantity: '2',
  unitPrice: '100.50',
  taxable: true,
  ...over,
})

describe('quoteEditSchema', () => {
  it('turns decimal strings into minor units', () => {
    const edit = parse([item()], '10')
    expect(edit.items[0]).toMatchObject({ quantity: 2, unitPrice: 10050 })
    expect(edit.discount).toBe(1000)
  })

  it.each([
    [{ description: ' ' }],
    [{ quantity: '0' }],
    [{ quantity: '1.5' }],
    [{ unitPrice: '1.234' }],
    [{ unitPrice: '-1' }],
  ])('rejects the item %j', (over) => {
    expect(
      quoteEditSchema.safeParse({
        id: 'q1',
        items: [item(over)],
        discount: '0',
        adminNote: '',
      }).success,
    ).toBe(false)
  })

  it('needs at least one item', () => {
    expect(
      quoteEditSchema.safeParse({
        id: 'q1',
        items: [],
        discount: '0',
        adminNote: '',
      }).success,
    ).toBe(false)
  })
})

describe('repriceQuote', () => {
  let n = 0
  const id = () => String(++n)

  it('totals items, discount and tax on the taxable part', () => {
    const edit = parse(
      [
        item(),
        item({
          description: 'Fee',
          quantity: '1',
          unitPrice: '50',
          taxable: false,
        }),
      ],
      '25',
    )
    const result = repriceQuote(edit, [], 1000, id)
    // 2 x 100.50 taxable + 50 not taxable = 251.00, less 25.00 discount.
    expect(result.subtotal).toBe(25100)
    expect(result.discountAmount).toBe(2500)
    // Discount reduces the taxable base pro rata: 20100 - 2004 = 18096, 10%.
    expect(result.taxAmount).toBe(1810)
    expect(result.total).toBe(25100 - 2500 + 1810)
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0].serviceId).not.toBe(result.lines[1].serviceId)
  })

  it('caps the discount at the subtotal and keeps recurring lines', () => {
    const recurring = [
      {
        serviceId: 'r',
        name: 'Hosting',
        billing: 'monthly' as const,
        quantity: 1,
        unitPrice: 1000,
        baseAmount: 1000,
        options: [],
        amount: 1000,
        taxable: true,
      },
    ]
    const result = repriceQuote(parse([item()], '9999'), recurring, 1000, id)
    expect(result.discountAmount).toBe(result.subtotal)
    expect(result.total).toBe(0)
    expect(result.recurring.total).toBe(1100)
  })
})

describe('quotesToCsv', () => {
  const row = {
    number: 'QUO-0001',
    createdAt: '2026-06-01T10:00:00.000Z',
    contactName: 'Jo, the "Boss"',
    contactEmail: 'jo@example.com',
    status: 'sent' as const,
    currency: 'USD',
    total: 12345,
    validUntil: '2026-07-01',
    message: 'Line one\nLine two',
    displayCurrency: null,
    displayRate: null,
  }

  it('writes a header and quotes cells that need it', () => {
    const [header, line] = quotesToCsv([row]).split('\r\n')
    expect(header).toBe(
      'Number,Received,Name,Email,Status,Currency,Total,Valid until,Message,Display currency,Display rate',
    )
    expect(line).toBe(
      'QUO-0001,2026-06-01T10:00:00.000Z,"Jo, the ""Boss""",jo@example.com,Sent,USD,123.45,2026-07-01,"Line one\nLine two",,',
    )
  })

  it('writes the display currency and rate when a quote has them', () => {
    const [, line] = quotesToCsv([
      { ...row, displayCurrency: 'EUR', displayRate: 0.92 },
    ]).split('\r\n')
    expect(line.endsWith(',EUR,0.92')).toBe(true)
  })

  it('defuses spreadsheet formulas and blanks missing values', () => {
    const csv = quotesToCsv([
      {
        ...row,
        number: null,
        validUntil: null,
        contactName: '=HYPERLINK("http://x")',
        message: '+1',
      },
    ])
    expect(csv).toContain('"\'=HYPERLINK(""http://x"")"')
    expect(csv).toContain(",'+1")
    expect(csv.split('\r\n')[1].startsWith(',2026')).toBe(true)
  })

  it('returns only the header for no rows', () => {
    expect(quotesToCsv([])).not.toContain('\r\n')
  })
})
