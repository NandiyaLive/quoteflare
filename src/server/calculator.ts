import type { Db } from '#/db'
import type { CalculatorCatalog } from '#/lib/calculator'
import { listCategories, listServices } from './services'

export async function loadCalculatorCatalog(
  db: Db,
): Promise<CalculatorCatalog & { businessName: string }> {
  const [services, categories, settings] = await Promise.all([
    listServices(db, 'active'),
    listCategories(db),
    db.query.settings.findFirst(),
  ])
  const activeIds = new Set(services.map((s) => s.id))

  return {
    businessName: settings?.businessName ?? '',
    currency: settings?.currency ?? 'USD',
    taxRateBps: settings?.taxRateBps ?? 0,
    categories,
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      categoryId: s.categoryId,
      description: s.description,
      note: s.note,
      unitLabel: s.unitLabel,
      unitPrice: s.unitPrice,
      pricingMode: s.pricingMode,
      billing: s.billing,
      minQuantity: s.minQuantity,
      maxQuantity: s.maxQuantity,
      quantityStep: s.quantityStep,
      taxable: s.taxable,
      estimatedDaysMin: s.estimatedDaysMin,
      estimatedDaysMax: s.estimatedDaysMax,
      requires: s.requires.map((r) => r.id).filter((id) => activeIds.has(id)),
      groups: s.groups,
      options: s.options.map((o) => ({ ...o, active: true })),
    })),
  }
}
