import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { createDb } from '#/db'
import { packageSchema } from '#/lib/packages'
import {
  categoriesSchema,
  issuePath,
  reorderSchema,
  toggleSchema,
} from '#/lib/services'
import { requireAdmin } from './admin-middleware'
import {
  listPackageCategories,
  listPackages,
  reorderPackages,
  savePackage,
  savePackageCategories,
  setPackageActive,
  type SavePackageCategoriesResult,
  type SavePackageResult,
} from './packages'
import { listServices } from './services'
import { loadSettings } from './settings'

export const getPackages = createServerFn()
  .middleware([requireAdmin])
  .handler(async () => {
    const db = createDb(env.DB)
    const [packages, categories, services, settings] = await Promise.all([
      listPackages(db, 'all'),
      listPackageCategories(db),
      listServices(db, 'active'),
      loadSettings(db),
    ])
    return {
      packages,
      categories,
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        minQuantity: s.minQuantity,
        maxQuantity: s.maxQuantity,
        options: s.options.map((o) => ({ id: o.id, name: o.name })),
      })),
      currency: settings.values.currency,
    }
  })

export const savePackageAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .middleware([requireAdmin])
  .handler(async ({ data }): Promise<SavePackageResult> => {
    const parsed = packageSchema.safeParse(data)
    if (!parsed.success) {
      const errors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        errors[issuePath(issue.path) || 'form'] ??= issue.message
      }
      return { ok: false, errors }
    }
    return savePackage(createDb(env.DB), parsed.data)
  })

export const setPackageActiveAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => toggleSchema.parse(input))
  .middleware([requireAdmin])
  .handler(async ({ data }) => {
    const found = await setPackageActive(createDb(env.DB), data.id, data.active)
    return found
      ? { ok: true as const }
      : { ok: false as const, error: 'This package no longer exists.' }
  })

export const reorderPackagesAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => reorderSchema.parse(input))
  .middleware([requireAdmin])
  .handler(({ data }) => reorderPackages(createDb(env.DB), data.ids))

export const savePackageCategoriesAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .middleware([requireAdmin])
  .handler(async ({ data }): Promise<SavePackageCategoriesResult> => {
    const parsed = categoriesSchema.safeParse(data)
    if (!parsed.success) {
      const errors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        errors[issuePath(issue.path) || 'form'] ??= issue.message
      }
      return { ok: false, errors }
    }
    return savePackageCategories(createDb(env.DB), parsed.data.categories)
  })
