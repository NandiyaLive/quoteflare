import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { getRequestUrl } from '@tanstack/react-start/server'
import { createDb } from '#/db'
import {
  invoiceIdSchema,
  invoiceSchema,
  invoiceStatusChangeSchema,
} from '#/lib/invoices'
import { requireAdmin } from './admin-middleware'
import { listActiveClients } from './clients'
import { sendInvoiceEmail } from './invoice-email'
import {
  changeInvoiceStatus,
  createInvoice,
  getPublicInvoice,
  getInvoice,
  listInvoices,
  updateInvoice,
} from './invoices'
import { listServices } from './services'

export type SaveInvoiceActionResult =
  | { ok: true; id: string; number: string }
  | { ok: false; errors: Record<string, string> }

export const getInvoices = createServerFn()
  .middleware([requireAdmin])
  .handler(() => listInvoices(createDb(env.DB)))

export const getInvoiceDetail = createServerFn()
  .validator((input: unknown) => String(input))
  .middleware([requireAdmin])
  .handler(({ data }) => getInvoice(createDb(env.DB), data))

export const getInvoiceFormContext = createServerFn()
  .middleware([requireAdmin])
  .handler(async () => {
    const db = createDb(env.DB)
    const [clients, services, settings] = await Promise.all([
      listActiveClients(db),
      listServices(db, 'active'),
      db.query.settings.findFirst(),
    ])
    return {
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        company: c.company,
      })),
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        unitPrice: s.unitPrice,
        minQuantity: s.minQuantity,
        taxable: s.taxable,
      })),
      currency: settings?.currency ?? 'LKR',
      taxRateBps: settings?.taxRateBps ?? 0,
    }
  })

export const saveInvoiceAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .middleware([requireAdmin])
  .handler(async ({ data }): Promise<SaveInvoiceActionResult> => {
    const parsed = invoiceSchema.safeParse(data)
    if (!parsed.success) {
      const errors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        errors[issue.path.join('.') || 'form'] ??= issue.message
      }
      return { ok: false, errors }
    }
    const db = createDb(env.DB)
    const { id } = parsed.data
    const result = id
      ? await updateInvoice(db, id, parsed.data)
      : await createInvoice(db, parsed.data)
    return result.ok ? result : { ok: false, errors: { form: result.error } }
  })

export const changeInvoiceStatusAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => invoiceStatusChangeSchema.parse(input))
  .middleware([requireAdmin])
  .handler(({ data }) =>
    changeInvoiceStatus(createDb(env.DB), data.id, data.status),
  )

export const sendInvoiceEmailAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => invoiceIdSchema.parse(input))
  .middleware([requireAdmin])
  .handler(({ data }) =>
    sendInvoiceEmail(
      createDb(env.DB),
      {
        apiKey: env.RESEND_API_KEY,
        from: env.EMAIL_FROM,
        origin: getRequestUrl().origin,
      },
      data.id,
    ),
  )

export const getPublicInvoiceAction = createServerFn()
  .validator((input: unknown) => String(input))
  .handler(({ data }) => getPublicInvoice(createDb(env.DB), data))
