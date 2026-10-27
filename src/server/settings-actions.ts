import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { createDb } from '#/db'
import {
  invoiceEmailTemplateSchema,
  SAMPLE_VARIABLES,
  withDefaults,
} from '#/lib/email-template'
import { settingsSchema } from '#/lib/settings'
import { requireAdmin } from './admin-middleware'
import { buildInvoiceEmail } from './invoice-email'
import {
  loadInvoiceEmailTemplate,
  loadSettings,
  saveInvoiceEmailTemplate,
  saveSettings,
  storeLogo,
} from './settings'

export type SaveSettingsResult =
  { ok: true } | { ok: false; errors: Record<string, string> }

export const getSettings = createServerFn()
  .middleware([requireAdmin])
  .handler(() => loadSettings(createDb(env.DB)))

export const updateSettings = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .middleware([requireAdmin])
  .handler(async ({ data }): Promise<SaveSettingsResult> => {
    const parsed = settingsSchema.safeParse(data)
    if (!parsed.success) {
      const errors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form')
        errors[field] ??= issue.message
      }
      return { ok: false, errors }
    }
    await saveSettings(createDb(env.DB), parsed.data)
    return { ok: true }
  })

export const uploadLogo = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const file = input instanceof FormData ? input.get('logo') : null
    if (!(file instanceof File))
      throw new Error('Choose a logo file to upload.')
    return file
  })
  .middleware([requireAdmin])
  .handler(({ data }) => storeLogo(createDb(env.DB), env.FILES, data))

export const getInvoiceEmailTemplate = createServerFn()
  .middleware([requireAdmin])
  .handler(() => loadInvoiceEmailTemplate(createDb(env.DB)))

export const updateInvoiceEmailTemplate = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .middleware([requireAdmin])
  .handler(async ({ data }): Promise<SaveSettingsResult> => {
    const parsed = invoiceEmailTemplateSchema.safeParse(data)
    if (!parsed.success) {
      const errors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        errors[String(issue.path[0] ?? 'form')] ??= issue.message
      }
      return { ok: false, errors }
    }
    const saved = await saveInvoiceEmailTemplate(createDb(env.DB), parsed.data)
    if (!saved) {
      return {
        ok: false,
        errors: { form: 'Save your business details first.' },
      }
    }
    return { ok: true }
  })

/** Renders the template with sample values so the editor can show a preview. */
export const previewInvoiceEmail = createServerFn({ method: 'POST' })
  .validator((input: unknown) => invoiceEmailTemplateSchema.parse(input))
  .middleware([requireAdmin])
  .handler(async ({ data }) => {
    const settings = await loadSettings(createDb(env.DB))
    const email = await buildInvoiceEmail(
      {
        ...SAMPLE_VARIABLES,
        businessName:
          settings.values.businessName || SAMPLE_VARIABLES.businessName,
        url: '#',
      },
      withDefaults(data),
    )
    return { subject: email.subject, html: email.html }
  })
