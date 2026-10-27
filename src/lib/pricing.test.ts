import { describe, expect, it } from 'vitest'
import {
  calculatePrice,
  type PricingBreakdown,
  type PricingInput,
  type PricingService,
} from './pricing'

const service = (overrides: Partial<PricingService> = {}): PricingService => ({
  id: 'svc',
  name: 'Design',
  unitPrice: 10000,
  pricingMode: 'fixed',
  billing: 'one_time',
  minQuantity: 1,
  maxQuantity: null,
  quantityStep: 1,
  taxable: true,
  groups: [],
  options: [],
  ...overrides,
})

const flat = (id: string, value: number, groupId: string | null = null) => ({
  id,
  name: id,
  groupId,
  modifierType: 'flat' as const,
  modifierValue: value,
  active: true,
})

const percent = (id: string, bps: number, groupId: string | null = null) => ({
  id,
  name: id,
  groupId,
  modifierType: 'percent' as const,
  modifierValue: bps,
  active: true,
})

const input = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  services: [service()],
  selections: [{ serviceId: 'svc', quantity: 1, optionIds: [] }],
  taxRateBps: 0,
  discount: 0,
  ...overrides,
})

const price = (i: PricingInput): PricingBreakdown => {
  const result = calculatePrice(i)
  if (!result.ok) throw new Error(`unexpected errors ${JSON.stringify(result)}`)
  return result
}

const errorCodes = (i: PricingInput) => {
  const result = calculatePrice(i)
  if (result.ok) throw new Error('expected errors')
  return result.errors.map((e) => e.code)
}

describe('calculatePrice totals', () => {
  it('prices a single service with quantity 1', () => {
    const result = price(input())
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]).toMatchObject({
      quantity: 1,
      unitPrice: 10000,
      baseAmount: 10000,
      amount: 10000,
    })
    expect(result).toMatchObject({
      subtotal: 10000,
      discountAmount: 0,
      taxAmount: 0,
      total: 10000,
    })
  })

  it('multiplies by quantity', () => {
    const result = price(
      input({ selections: [{ serviceId: 'svc', quantity: 3, optionIds: [] }] }),
    )
    expect(result.lines[0].baseAmount).toBe(30000)
    expect(result.total).toBe(30000)
  })

  it('adds a flat option once to the line', () => {
    const result = price(
      input({
        services: [service({ options: [flat('rush', 2500)] })],
        selections: [{ serviceId: 'svc', quantity: 2, optionIds: ['rush'] }],
      }),
    )
    expect(result.lines[0].options).toEqual([
      { optionId: 'rush', name: 'rush', amount: 2500 },
    ])
    expect(result.subtotal).toBe(22500)
  })

  it('applies a percentage option to the base amount', () => {
    const result = price(
      input({
        services: [service({ options: [percent('premium', 2500)] })],
        selections: [{ serviceId: 'svc', quantity: 2, optionIds: ['premium'] }],
      }),
    )
    expect(result.lines[0].options[0].amount).toBe(5000)
    expect(result.subtotal).toBe(25000)
  })

  it('applies two options to one line without compounding', () => {
    const result = price(
      input({
        services: [
          service({ options: [percent('premium', 1000), flat('rush', 500)] }),
        ],
        selections: [
          { serviceId: 'svc', quantity: 1, optionIds: ['premium', 'rush'] },
        ],
      }),
    )
    expect(result.lines[0].amount).toBe(10000 + 1000 + 500)
    expect(result.subtotal).toBe(11500)
  })

  it('caps a discount larger than the subtotal', () => {
    const result = price(input({ discount: 99999, taxRateBps: 1000 }))
    expect(result).toMatchObject({
      subtotal: 10000,
      discountAmount: 10000,
      taxAmount: 0,
      total: 0,
    })
  })

  it('applies the discount before tax', () => {
    const result = price(input({ discount: 2000, taxRateBps: 1000 }))
    expect(result).toMatchObject({
      subtotal: 10000,
      discountAmount: 2000,
      taxAmount: 800,
      total: 8800,
    })
  })

  it('charges no tax at 0 percent', () => {
    const result = price(input({ taxRateBps: 0 }))
    expect(result.taxAmount).toBe(0)
    expect(result.total).toBe(10000)
  })

  it('returns all zeros for an empty selection', () => {
    const result = price(
      input({ selections: [], taxRateBps: 1500, discount: 500 }),
    )
    expect(result).toEqual({
      ok: true,
      lines: [],
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      total: 0,
      recurring: { lines: [], subtotal: 0, taxAmount: 0, total: 0 },
    })
  })
})

describe('calculatePrice rounding', () => {
  it('rounds a half cent of tax up (10.005 dollars becomes 10.01)', () => {
    // 5% of 200.10 is 10.005
    const result = price(
      input({
        services: [service({ unitPrice: 20010 })],
        taxRateBps: 500,
      }),
    )
    expect(result.taxAmount).toBe(1001)
    expect(result.total).toBe(21011)
  })

  it('rounds just below a half cent down', () => {
    // 5% of 200.08 is 10.004
    const result = price(
      input({ services: [service({ unitPrice: 20008 })], taxRateBps: 500 }),
    )
    expect(result.taxAmount).toBe(1000)
  })

  it('rounds a half cent of percentage option up', () => {
    // 0.5% of 1010 cents is 5.05 cents, rounds down
    const up = price(
      input({
        services: [service({ unitPrice: 1010, options: [percent('fee', 50)] })],
        selections: [{ serviceId: 'svc', quantity: 1, optionIds: ['fee'] }],
      }),
    )
    expect(up.lines[0].options[0].amount).toBe(5)

    // 1% of 1050 cents is exactly 10.5 cents, rounds up
    const half = price(
      input({
        services: [
          service({ unitPrice: 1050, options: [percent('fee', 100)] }),
        ],
        selections: [{ serviceId: 'svc', quantity: 1, optionIds: ['fee'] }],
      }),
    )
    expect(half.lines[0].options[0].amount).toBe(11)
  })

  it('calculates tax once on the discounted subtotal, not per line', () => {
    const result = price(
      input({
        services: [
          service({ id: 'a', unitPrice: 333 }),
          service({ id: 'b', unitPrice: 333 }),
          service({ id: 'c', unitPrice: 333 }),
        ],
        selections: ['a', 'b', 'c'].map((serviceId) => ({
          serviceId,
          quantity: 1,
          optionIds: [],
        })),
        taxRateBps: 850,
      }),
    )
    // 999 * 8.5% = 84.915 -> 85, per-line rounding would give 3 * 28 = 84
    expect(result.taxAmount).toBe(85)
  })

  it('handles amounts beyond 2^53 in the intermediate product', () => {
    const result = price(
      input({
        services: [service({ unitPrice: 99_999_999_999 })],
        taxRateBps: 10000,
        discount: 50_000_000_000,
      }),
    )
    expect(result.taxAmount).toBe(49_999_999_999)
  })
})

describe('calculatePrice taxable lines and recurring lines', () => {
  it('counts only taxable lines toward the tax base', () => {
    const result = price(
      input({
        services: [
          service({ id: 'a', unitPrice: 10000 }),
          service({ id: 'b', unitPrice: 10000, taxable: false }),
        ],
        selections: [
          { serviceId: 'a', quantity: 1, optionIds: [] },
          { serviceId: 'b', quantity: 1, optionIds: [] },
        ],
        taxRateBps: 1000,
      }),
    )
    expect(result).toMatchObject({
      subtotal: 20000,
      taxAmount: 1000,
      total: 21000,
    })
  })

  it('spreads the discount over taxable and untaxed lines pro rata', () => {
    const result = price(
      input({
        services: [
          service({ id: 'a', unitPrice: 10000 }),
          service({ id: 'b', unitPrice: 10000, taxable: false }),
        ],
        selections: [
          { serviceId: 'a', quantity: 1, optionIds: [] },
          { serviceId: 'b', quantity: 1, optionIds: [] },
        ],
        taxRateBps: 1000,
        discount: 4000,
      }),
    )
    // taxable base 10000 - 2000 = 8000, tax 800
    expect(result.taxAmount).toBe(800)
    expect(result.total).toBe(20000 - 4000 + 800)
  })

  it('returns recurring lines apart from the one-time total', () => {
    const result = price(
      input({
        services: [
          service({ id: 'once', unitPrice: 10000 }),
          service({ id: 'hosting', unitPrice: 2000, billing: 'monthly' }),
        ],
        selections: [
          { serviceId: 'once', quantity: 1, optionIds: [] },
          { serviceId: 'hosting', quantity: 12, optionIds: [] },
        ],
        taxRateBps: 1000,
        discount: 1000,
      }),
    )
    expect(result.lines.map((l) => l.serviceId)).toEqual(['once'])
    expect(result.subtotal).toBe(10000)
    expect(result.total).toBe(10000 - 1000 + 900)
    expect(result.recurring.lines.map((l) => l.serviceId)).toEqual(['hosting'])
    expect(result.recurring).toMatchObject({
      subtotal: 24000,
      taxAmount: 2400,
      total: 26400,
    })
  })

  it('uses the price override for custom services', () => {
    const result = price(
      input({
        services: [service({ pricingMode: 'custom', unitPrice: 5000 })],
        selections: [
          { serviceId: 'svc', quantity: 2, optionIds: [], priceOverride: 7500 },
        ],
      }),
    )
    expect(result.lines[0]).toMatchObject({ unitPrice: 7500, amount: 15000 })
  })
})

describe('calculatePrice validation', () => {
  it('enforces minimum, maximum and step', () => {
    const rules = service({ minQuantity: 2, maxQuantity: 10, quantityStep: 2 })
    const withQty = (quantity: number) =>
      input({
        services: [rules],
        selections: [{ serviceId: 'svc', quantity, optionIds: [] }],
      })
    expect(errorCodes(withQty(1))).toContain('quantity_below_minimum')
    expect(errorCodes(withQty(12))).toContain('quantity_above_maximum')
    expect(errorCodes(withQty(5))).toEqual(['quantity_step'])
    expect(errorCodes(withQty(0))).toEqual(['invalid_quantity'])
    expect(errorCodes(withQty(2.5))).toEqual(['invalid_quantity'])
    expect(price(withQty(2)).subtotal).toBe(20000)
    expect(price(withQty(10)).subtotal).toBe(100000)
  })

  it('requires a choice in a required group and allows one in a single group', () => {
    const grouped = service({
      groups: [{ id: 'g', name: 'Tier', selection: 'single', required: true }],
      options: [flat('a', 100, 'g'), flat('b', 200, 'g')],
    })
    const withOptions = (optionIds: string[]) =>
      input({
        services: [grouped],
        selections: [{ serviceId: 'svc', quantity: 1, optionIds }],
      })
    expect(errorCodes(withOptions([]))).toEqual(['required_group_missing'])
    expect(errorCodes(withOptions(['a', 'b']))).toEqual([
      'multiple_in_single_group',
    ])
    expect(price(withOptions(['b'])).subtotal).toBe(10200)
  })

  it('rejects unknown, inactive and repeated options and services', () => {
    const base = service({
      options: [flat('a', 100), { ...flat('old', 100), active: false }],
    })
    const select = (optionIds: string[]) =>
      input({
        services: [base],
        selections: [{ serviceId: 'svc', quantity: 1, optionIds }],
      })
    expect(errorCodes(select(['missing']))).toEqual(['unknown_option'])
    expect(errorCodes(select(['old']))).toEqual(['unknown_option'])
    expect(errorCodes(select(['a', 'a']))).toEqual(['duplicate_option'])
    expect(
      errorCodes(
        input({
          selections: [{ serviceId: 'nope', quantity: 1, optionIds: [] }],
        }),
      ),
    ).toEqual(['unknown_service'])
    expect(
      errorCodes(
        input({
          selections: [
            { serviceId: 'svc', quantity: 1, optionIds: [] },
            { serviceId: 'svc', quantity: 1, optionIds: [] },
          ],
        }),
      ),
    ).toEqual(['duplicate_service'])
  })

  it('requires an override for custom services and rejects it for fixed ones', () => {
    const custom = service({ pricingMode: 'custom' })
    const select = (priceOverride?: number) =>
      input({
        services: [custom],
        selections: [
          { serviceId: 'svc', quantity: 1, optionIds: [], priceOverride },
        ],
      })
    expect(errorCodes(select())).toEqual(['price_override_required'])
    expect(errorCodes(select(-1))).toEqual(['invalid_price_override'])
    expect(errorCodes(select(10.5))).toEqual(['invalid_price_override'])
    expect(
      errorCodes(
        input({
          selections: [
            { serviceId: 'svc', quantity: 1, optionIds: [], priceOverride: 1 },
          ],
        }),
      ),
    ).toEqual(['price_override_not_allowed'])
  })

  it('rejects an invalid tax rate or discount', () => {
    expect(errorCodes(input({ taxRateBps: -1 }))).toEqual(['invalid_tax_rate'])
    expect(errorCodes(input({ taxRateBps: 10001 }))).toEqual([
      'invalid_tax_rate',
    ])
    expect(errorCodes(input({ taxRateBps: 12.5 }))).toEqual([
      'invalid_tax_rate',
    ])
    expect(errorCodes(input({ discount: -5 }))).toEqual(['invalid_discount'])
    expect(errorCodes(input({ discount: Number.NaN }))).toEqual([
      'invalid_discount',
    ])
  })
})
