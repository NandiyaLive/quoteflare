import { fieldErrors } from '#/lib/field-errors'
import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { createDb } from '#/db'
import {
  categoriesSchema,
  issuePath,
  reorderSchema,
  serviceFilterSchema,
  serviceSchema,
  toggleSchema,
} from '#/lib/services'
import { requireAdmin } from './admin-middleware'
import { loadSettings } from './settings'
import {
  listCategories,
  listServices,
  saveCategories,
  reorderServices,
  saveService,
  setServiceActive,
  type SaveCategoriesResult,
  type SaveServiceResult,
} from './services'

export const getServices = createServerFn()
  .validator((input: unknown) => serviceFilterSchema.parse(input))
  .middleware([requireAdmin])
  .handler(async ({ data }) => {
    const db = createDb(env.DB)
    const [services, everyService, categories, settings] = await Promise.all([
      listServices(db, data.status),
      listServices(db, 'all'),
      listCategories(db),
      loadSettings(db),
    ])
    return {
      services,
      categories,
      choices: everyService.map((s) => ({
        id: s.id,
        name: s.name,
        active: s.active,
      })),
      currency: settings.values.currency,
    }
  })

export const saveServiceAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .middleware([requireAdmin])
  .handler(async ({ data }): Promise<SaveServiceResult> => {
    const parsed = serviceSchema.safeParse(data)
    if (!parsed.success) {
      return { ok: false, errors: fieldErrors(parsed.error, issuePath) }
    }
    return saveService(createDb(env.DB), parsed.data)
  })

export const saveCategoriesAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .middleware([requireAdmin])
  .handler(async ({ data }): Promise<SaveCategoriesResult> => {
    const parsed = categoriesSchema.safeParse(data)
    if (!parsed.success) {
      return { ok: false, errors: fieldErrors(parsed.error, issuePath) }
    }
    return saveCategories(createDb(env.DB), parsed.data.categories)
  })

export const setServiceActiveAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => toggleSchema.parse(input))
  .middleware([requireAdmin])
  .handler(async ({ data }) => {
    const found = await setServiceActive(createDb(env.DB), data.id, data.active)
    return found
      ? { ok: true as const }
      : { ok: false as const, error: 'This service no longer exists.' }
  })

export const reorderServicesAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => reorderSchema.parse(input))
  .middleware([requireAdmin])
  .handler(({ data }) => reorderServices(createDb(env.DB), data.ids))
