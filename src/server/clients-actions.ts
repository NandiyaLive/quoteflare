import { fieldErrors, firstSegment } from '#/lib/field-errors'
import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { createDb } from '#/db'
import {
  clientArchiveSchema,
  clientFilterSchema,
  clientSchema,
} from '#/lib/clients'
import { requireAdmin } from './admin-middleware'
import {
  getClient,
  listClientInvoices,
  listClients,
  saveClient,
  setClientArchived,
} from './clients'

export type SaveClientResult =
  { ok: true; id: string } | { ok: false; errors: Record<string, string> }

export const getClients = createServerFn()
  .validator((input: unknown) => clientFilterSchema.parse(input))
  .middleware([requireAdmin])
  .handler(({ data }) => listClients(createDb(env.DB), data))

export const getClientDetail = createServerFn()
  .validator((input: unknown) => String(input))
  .middleware([requireAdmin])
  .handler(async ({ data }) => {
    const db = createDb(env.DB)
    const client = await getClient(db, data)
    if (!client) return null
    return { client, invoices: await listClientInvoices(db, data) }
  })

export const saveClientAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .middleware([requireAdmin])
  .handler(async ({ data }): Promise<SaveClientResult> => {
    const parsed = clientSchema.safeParse(data)
    if (!parsed.success) {
      return { ok: false, errors: fieldErrors(parsed.error, firstSegment) }
    }
    const result = await saveClient(createDb(env.DB), parsed.data)
    return result.ok ? result : { ok: false, errors: { form: result.error } }
  })

export const setClientArchivedAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => clientArchiveSchema.parse(input))
  .middleware([requireAdmin])
  .handler(async ({ data }) => ({
    ok: await setClientArchived(createDb(env.DB), data.id, data.archived),
  }))
