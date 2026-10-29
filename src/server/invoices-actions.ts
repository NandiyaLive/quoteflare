import { fieldErrors, dottedPath } from '#/lib/field-errors'
import { DEFAULT_CURRENCY } from '#/lib/settings'
import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { getRequest, getRequestUrl } from '@tanstack/react-start/server'
import { createDb } from '#/db'
import {
  advancePaidSchema,
  invoiceIdSchema,
  invoiceSchema,
  invoiceStatusChangeSchema,
} from '#/lib/invoices'
import { requireAdmin } from './admin-middleware'
import { listActiveClients } from './clients'
import { sendInvoiceEmail } from './invoice-email'
import { isRateLimited, tooManyRequests } from './rate-limit'
import {
  changeInvoiceStatus,
  createInvoice,
  getPublicInvoice,
  getInvoice,
  listInvoices,
  setAdvancePaid,
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
      currency: settings?.currency ?? DEFAULT_CURRENCY,
      taxRateBps: settings?.taxRateBps ?? 0,
      paymentTermDays: settings?.paymentTermDays ?? 14,
    }
  })

export const saveInvoiceAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .middleware([requireAdmin])
  .handler(async ({ data }): Promise<SaveInvoiceActionResult> => {
    const parsed = invoiceSchema.safeParse(data)
    if (!parsed.success) {
      return { ok: false, errors: fieldErrors(parsed.error, dottedPath) }
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

export const setAdvancePaidAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => advancePaidSchema.parse(input))
  .middleware([requireAdmin])
  .handler(({ data }) => setAdvancePaid(createDb(env.DB), data.id, data.paid))

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
  .validator((input: unknown) => String(input).slice(0, 64))
  .handler(async ({ data }) => {
    // server.ts limits page loads of /i/<token>, and rendering that page calls
    // this function inside the same request. Client-side navigation calls it
    // through the server function endpoint, so only those calls count here.
    const request = getRequest()
    if (
      !new URL(request.url).pathname.startsWith('/i/') &&
      (await isRateLimited(env.INVOICE_LIMITER, request))
    ) {
      throw tooManyRequests()
    }
    return getPublicInvoice(createDb(env.DB), data)
  })
