import {
  calculatePrice,
  type PricingBreakdown,
  type PricingErrorCode,
  type PricingSelection,
  type PricingService,
} from '#/lib/pricing'

export type CalculatorService = PricingService & {
  categoryId: string | null
  description: string
  note: string
  unitLabel: string
  estimatedDaysMin: number | null
  estimatedDaysMax: number | null
  requires: string[]
  alwaysIncluded: boolean
}

export type CalculatorPackage = {
  id: string
  categoryId: string | null
  name: string
  description: string
  items: { serviceId: string; quantity: number; optionIds: string[] }[]
}

export type CalculatorCatalog = {
  categories: { id: string; name: string }[]
  packageCategories: { id: string; name: string }[]
  services: CalculatorService[]
  packages: CalculatorPackage[]
  currency: string
  /** Rate from `currency` to each currency the customer may view prices in. */
  rates: Record<string, number>
  taxRateBps: number
}

export type ChosenService = {
  quantity: string
  optionIds: string[]
}

export type CalculatorState = Record<string, ChosenService>

const QUANTITY_PATTERN = /^\d{1,6}$/

const emptyChoice = (service: CalculatorService): ChosenService => ({
  quantity: String(service.minQuantity),
  optionIds: [],
})

export function selectService(
  catalog: CalculatorCatalog,
  state: CalculatorState,
  serviceId: string,
): CalculatorState {
  const byId = new Map(catalog.services.map((s) => [s.id, s]))
  const next = { ...state }
  const stack = [serviceId]
  while (stack.length > 0) {
    const id = stack.pop()!
    const service = byId.get(id)
    if (!service || next[id]) continue
    next[id] = emptyChoice(service)
    stack.push(...service.requires)
  }
  return next
}

/**
 * The services every quote carries: those marked always included, plus
 * whatever they require.
 */
export function includedServiceIds(catalog: CalculatorCatalog): Set<string> {
  const byId = new Map(catalog.services.map((s) => [s.id, s]))
  const ids = new Set<string>()
  const stack = catalog.services
    .filter((s) => s.alwaysIncluded)
    .map((s) => s.id)
  while (stack.length > 0) {
    const id = stack.pop()!
    const service = byId.get(id)
    if (!service || ids.has(id)) continue
    ids.add(id)
    stack.push(...service.requires)
  }
  return ids
}

/** The selection a quote starts from before the customer picks anything. */
export function baseState(catalog: CalculatorCatalog): CalculatorState {
  let state: CalculatorState = {}
  for (const service of catalog.services) {
    if (service.alwaysIncluded)
      state = selectService(catalog, state, service.id)
  }
  return state
}

/**
 * Selections for the always included services missing from `chosenIds`, at
 * their minimum quantity with no options.
 */
export function missingIncluded(
  catalog: CalculatorCatalog,
  chosenIds: Set<string>,
): PricingSelection[] {
  const included = includedServiceIds(catalog)
  return catalog.services
    .filter((s) => included.has(s.id) && !chosenIds.has(s.id))
    .map((s) => ({ serviceId: s.id, quantity: s.minQuantity, optionIds: [] }))
}

export type SavedCalculator = { state: CalculatorState; chosen: string | null }

/**
 * Rebuilds a selection saved in the browser. The saved data is untrusted and
 * may predate catalog changes, so it keeps only services and options that
 * still exist and quantities that are digits. It returns null when nothing
 * usable is left.
 */
export function restoreSaved(
  catalog: CalculatorCatalog,
  saved: unknown,
): SavedCalculator | null {
  if (!saved || typeof saved !== 'object') return null
  const { state: raw, chosen } = saved as Record<string, unknown>
  if (!raw || typeof raw !== 'object') return null

  const state = baseState(catalog)
  let restored = 0
  for (const service of catalog.services) {
    const entry = (raw as Record<string, unknown>)[service.id]
    if (!entry || typeof entry !== 'object') continue
    const { quantity, optionIds } = entry as Record<string, unknown>
    if (typeof quantity !== 'string' || !QUANTITY_PATTERN.test(quantity))
      continue
    const known = new Set(service.options.map((o) => o.id))
    const ids = Array.isArray(optionIds)
      ? optionIds.filter((id): id is string => known.has(id as string))
      : []
    state[service.id] = { quantity, optionIds: ids }
    restored++
  }
  if (restored === 0) return null
  return { state, chosen: typeof chosen === 'string' ? chosen : null }
}

/**
 * Builds the selection a package starts from. Services that are no longer
 * in the catalog and options that no longer exist are skipped, and required
 * and always included services are pulled in.
 */
export function stateForPackage(
  catalog: CalculatorCatalog,
  pkg: CalculatorPackage,
): CalculatorState {
  const byId = new Map(catalog.services.map((s) => [s.id, s]))
  let state = baseState(catalog)
  for (const item of pkg.items) {
    if (!byId.has(item.serviceId)) continue
    state = selectService(catalog, state, item.serviceId)
  }
  for (const item of pkg.items) {
    const service = byId.get(item.serviceId)
    if (!service) continue
    const known = new Set(service.options.map((o) => o.id))
    state[item.serviceId] = {
      ...state[item.serviceId],
      quantity: String(item.quantity),
      optionIds: item.optionIds.filter((id) => known.has(id)),
    }
  }
  return state
}

export function dependentsOf(
  catalog: CalculatorCatalog,
  state: CalculatorState,
  serviceId: string,
) {
  return catalog.services.filter(
    (s) => state[s.id] && s.requires.includes(serviceId),
  )
}

export function deselectService(
  catalog: CalculatorCatalog,
  state: CalculatorState,
  serviceId: string,
): CalculatorState {
  if (catalog.services.some((s) => s.id === serviceId && s.alwaysIncluded)) {
    return state
  }
  const next = { ...state }
  delete next[serviceId]
  return next
}

const MESSAGES: Record<PricingErrorCode, string> = {
  invalid_tax_rate: 'The tax rate is invalid.',
  invalid_discount: 'The discount is invalid.',
  unknown_service: 'This service is not available.',
  duplicate_service: 'This service is selected twice.',
  invalid_quantity: 'Enter a whole number of 1 or more.',
  quantity_below_minimum: 'The quantity is below the minimum.',
  quantity_above_maximum: 'The quantity is above the maximum.',
  quantity_step: 'The quantity does not fit the allowed steps.',
  unknown_option: 'This option is not available.',
  duplicate_option: 'This option is selected twice.',
  multiple_in_single_group: 'Choose only one option in this group.',
  required_group_missing: 'Choose an option in each required group.',
}

export type Evaluation = {
  breakdown: PricingBreakdown
  problems: Record<string, string[]>
}

const toSelection = (
  service: CalculatorService,
  choice: ChosenService,
): PricingSelection | null => {
  if (!QUANTITY_PATTERN.test(choice.quantity)) return null
  const selection: PricingSelection = {
    serviceId: service.id,
    quantity: Number(choice.quantity),
    optionIds: choice.optionIds,
  }
  return selection
}

export function evaluate(
  catalog: CalculatorCatalog,
  state: CalculatorState,
): Evaluation {
  const problems: Record<string, string[]> = {}
  const valid: PricingSelection[] = []

  for (const service of catalog.services) {
    const choice = state[service.id]
    if (!choice) continue
    const selection = toSelection(service, choice)
    if (!selection) {
      problems[service.id] = [MESSAGES.invalid_quantity]
      continue
    }
    const single = calculatePrice({
      services: [service],
      selections: [selection],
      taxRateBps: catalog.taxRateBps,
      discount: 0,
    })
    if (single.ok) valid.push(selection)
    else {
      problems[service.id] = [
        ...new Set(single.errors.map((e) => MESSAGES[e.code])),
      ]
    }
  }

  const result = calculatePrice({
    services: catalog.services,
    selections: valid,
    taxRateBps: catalog.taxRateBps,
    discount: 0,
  })
  if (!result.ok) throw new Error('Validated selections failed to price')
  return { breakdown: result, problems }
}
