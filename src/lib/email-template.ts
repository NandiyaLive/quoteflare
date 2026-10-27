import { z } from 'zod'

export const TEMPLATE_VARIABLES = [
  'businessName',
  'number',
  'total',
  'dueDate',
] as const

export type TemplateVariables = Record<
  (typeof TEMPLATE_VARIABLES)[number],
  string
>

export const DEFAULT_INVOICE_EMAIL = {
  subject: 'Invoice {{number}} from {{businessName}}',
  body: 'Invoice {{number}} from {{businessName}} is ready.\n\nAmount due: {{total}}\nDue date: {{dueDate}}',
  button: 'View the invoice',
}

export const SAMPLE_VARIABLES: TemplateVariables = {
  businessName: 'Your business',
  number: 'INV-0001',
  total: 'USD 1,100.00',
  dueDate: '2026-12-01',
}

const unknownVariables = (value: string) =>
  [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)]
    .map((m) => m[1])
    .filter((name) => !(TEMPLATE_VARIABLES as readonly string[]).includes(name))

const knownVariablesOnly = (value: string) =>
  unknownVariables(value).length === 0

const variableMessage = `Use only ${TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(', ')}`

export const invoiceEmailTemplateSchema = z.strictObject({
  subject: z
    .string()
    .trim()
    .max(200, 'Subject must be 200 characters or fewer')
    .refine(knownVariablesOnly, variableMessage),
  body: z
    .string()
    .trim()
    .max(2000, 'Message must be 2000 characters or fewer')
    .refine(knownVariablesOnly, variableMessage),
  button: z
    .string()
    .trim()
    .max(60, 'Button label must be 60 characters or fewer')
    .refine(knownVariablesOnly, variableMessage),
})

export type InvoiceEmailTemplate = z.infer<typeof invoiceEmailTemplateSchema>

/** Replaces `{{name}}` placeholders. Unknown names are left as written. */
export function fillTemplate(template: string, vars: TemplateVariables) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
    name in vars ? vars[name as keyof TemplateVariables] : match,
  )
}

/** An empty field means "use the default". */
export const withDefaults = (
  template: InvoiceEmailTemplate,
): InvoiceEmailTemplate => ({
  subject: template.subject || DEFAULT_INVOICE_EMAIL.subject,
  body: template.body || DEFAULT_INVOICE_EMAIL.body,
  button: template.button || DEFAULT_INVOICE_EMAIL.button,
})
