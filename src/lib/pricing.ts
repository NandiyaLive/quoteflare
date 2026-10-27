/*
 * Pricing rules. All amounts are integers in minor units (cents). Tax rates
 * are in basis points (1250 = 12.5%).
 *
 * - A line's base amount is unit price x quantity. Custom-priced services use
 *   the price override instead of the stored unit price.
 * - A percentage option applies to the line's base amount, not to other
 *   options, and rounds half up to a whole cent. A flat option adds its
 *   amount once to the line, whatever the quantity.
 * - Recurring lines are priced the same way but returned separately. They are
 *   never part of the one-time subtotal, discount or total. They get their own
 *   subtotal, tax and total at the same tax rate.
 * - The discount is a fixed amount. It applies to the one-time subtotal before
 *   tax and is capped at that subtotal.
 * - Only taxable lines count toward the tax base. The discount reduces the
 *   taxable base pro rata, rounded half up.
 * - Tax is calculated once on the discounted taxable base and rounds half up.
 */

export type PricingMode = 'fixed' | 'custom'
export type Billing = 'one_time' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export type PricingOption = {
  id: string
  name: string
  groupId: string | null
  modifierType: 'flat' | 'percent'
  /** Minor units for flat options, basis points for percent options. */
  modifierValue: number
  active: boolean
}

export type PricingOptionGroup = {
  id: string
  name: string
  selection: 'single' | 'multiple'
  required: boolean
}

export type PricingService = {
  id: string
  name: string
  unitPrice: number
  pricingMode: PricingMode
  billing: Billing
  minQuantity: number
  maxQuantity: number | null
  quantityStep: number
  taxable: boolean
  groups: PricingOptionGroup[]
  options: PricingOption[]
}

export type PricingSelection = {
  serviceId: string
  quantity: number
  optionIds: string[]
}

export type PricingInput = {
  services: PricingService[]
  selections: PricingSelection[]
  taxRateBps: number
  discount: number
}

export type PricedOption = {
  optionId: string
  name: string
  amount: number
}

export type PricedLine = {
  serviceId: string
  name: string
  billing: Billing
  quantity: number
  unitPrice: number
  baseAmount: number
  options: PricedOption[]
  amount: number
  taxable: boolean
}

export type PricingErrorCode =
  | 'invalid_tax_rate'
  | 'invalid_discount'
  | 'unknown_service'
  | 'duplicate_service'
  | 'invalid_quantity'
  | 'quantity_below_minimum'
  | 'quantity_above_maximum'
  | 'quantity_step'
  | 'unknown_option'
  | 'duplicate_option'
  | 'multiple_in_single_group'
  | 'required_group_missing'

export type PricingError = {
  code: PricingErrorCode
  serviceId?: string
  optionId?: string
  groupId?: string
}

export type RecurringTotals = {
  lines: PricedLine[]
  subtotal: number
  taxAmount: number
  total: number
}

export type PricingBreakdown = {
  lines: PricedLine[]
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
  recurring: RecurringTotals
}

export type PricingResult =
  ({ ok: true } & PricingBreakdown) | { ok: false; errors: PricingError[] }

const isMinor = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const mulDivRoundHalfUp = (a: number, b: number, divisor: number) => {
  const divisorBig = BigInt(divisor)
  const product = BigInt(a) * BigInt(b)
  return Number((product * 2n + divisorBig) / (divisorBig * 2n))
}

const percentOf = (amount: number, bps: number) =>
  mulDivRoundHalfUp(amount, bps, 10000)

const checkQuantity = (
  service: PricingService,
  quantity: number,
  errors: PricingError[],
) => {
  const serviceId = service.id
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    errors.push({ code: 'invalid_quantity', serviceId })
    return
  }
  if (quantity < service.minQuantity) {
    errors.push({ code: 'quantity_below_minimum', serviceId })
  }
  if (service.maxQuantity !== null && quantity > service.maxQuantity) {
    errors.push({ code: 'quantity_above_maximum', serviceId })
  }
  if (
    quantity >= service.minQuantity &&
    (quantity - service.minQuantity) % service.quantityStep !== 0
  ) {
    errors.push({ code: 'quantity_step', serviceId })
  }
}

const checkOptions = (
  service: PricingService,
  optionIds: string[],
  errors: PricingError[],
): PricingOption[] => {
  const serviceId = service.id
  const chosen: PricingOption[] = []
  const seen = new Set<string>()
  for (const optionId of optionIds) {
    const option = service.options.find((o) => o.id === optionId)
    if (!option || !option.active) {
      errors.push({ code: 'unknown_option', serviceId, optionId })
      continue
    }
    if (seen.has(optionId)) {
      errors.push({ code: 'duplicate_option', serviceId, optionId })
      continue
    }
    seen.add(optionId)
    chosen.push(option)
  }

  for (const group of service.groups) {
    const inGroup = chosen.filter((o) => o.groupId === group.id)
    if (group.selection === 'single' && inGroup.length > 1) {
      errors.push({
        code: 'multiple_in_single_group',
        serviceId,
        groupId: group.id,
      })
    }
    if (group.required && inGroup.length === 0) {
      errors.push({
        code: 'required_group_missing',
        serviceId,
        groupId: group.id,
      })
    }
  }
  return chosen
}

const priceLine = (
  service: PricingService,
  selection: PricingSelection,
  chosen: PricingOption[],
): PricedLine => {
  const unitPrice = service.unitPrice
  const baseAmount = unitPrice * selection.quantity
  const options = chosen.map((option) => ({
    optionId: option.id,
    name: option.name,
    amount:
      option.modifierType === 'flat'
        ? option.modifierValue
        : percentOf(baseAmount, option.modifierValue),
  }))
  return {
    serviceId: service.id,
    name: service.name,
    billing: service.billing,
    quantity: selection.quantity,
    unitPrice,
    baseAmount,
    options,
    amount: options.reduce((sum, o) => sum + o.amount, baseAmount),
    taxable: service.taxable,
  }
}

const sum = (lines: PricedLine[]) => lines.reduce((s, l) => s + l.amount, 0)

const taxableSum = (lines: PricedLine[]) =>
  lines.reduce((s, l) => (l.taxable ? s + l.amount : s), 0)

export const calculatePrice = (input: PricingInput): PricingResult => {
  const errors: PricingError[] = []
  if (
    !Number.isSafeInteger(input.taxRateBps) ||
    input.taxRateBps < 0 ||
    input.taxRateBps > 10000
  ) {
    errors.push({ code: 'invalid_tax_rate' })
  }
  if (!isMinor(input.discount)) {
    errors.push({ code: 'invalid_discount' })
  }

  const lines: PricedLine[] = []
  const seenServices = new Set<string>()
  for (const selection of input.selections) {
    const service = input.services.find((s) => s.id === selection.serviceId)
    if (!service) {
      errors.push({ code: 'unknown_service', serviceId: selection.serviceId })
      continue
    }
    if (seenServices.has(service.id)) {
      errors.push({ code: 'duplicate_service', serviceId: service.id })
      continue
    }
    seenServices.add(service.id)

    const before = errors.length
    checkQuantity(service, selection.quantity, errors)
    const chosen = checkOptions(service, selection.optionIds, errors)

    if (errors.length === before) {
      lines.push(priceLine(service, selection, chosen))
    }
  }

  if (errors.length > 0) return { ok: false, errors }

  const oneTime = lines.filter((l) => l.billing === 'one_time')
  const recurringLines = lines.filter((l) => l.billing !== 'one_time')

  const subtotal = sum(oneTime)
  const discountAmount = Math.min(input.discount, subtotal)
  const taxableSubtotal = taxableSum(oneTime)
  const taxableDiscount =
    subtotal === 0
      ? 0
      : mulDivRoundHalfUp(discountAmount, taxableSubtotal, subtotal)
  const taxAmount = percentOf(
    taxableSubtotal - taxableDiscount,
    input.taxRateBps,
  )

  const recurringSubtotal = sum(recurringLines)
  const recurringTax = percentOf(taxableSum(recurringLines), input.taxRateBps)

  return {
    ok: true,
    lines: oneTime,
    subtotal,
    discountAmount,
    taxAmount,
    total: subtotal - discountAmount + taxAmount,
    recurring: {
      lines: recurringLines,
      subtotal: recurringSubtotal,
      taxAmount: recurringTax,
      total: recurringSubtotal + recurringTax,
    },
  }
}
