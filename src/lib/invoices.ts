import { z } from 'zod'
import { invoiceStatuses, type InvoiceStatus } from '#/db/schema'
import { decimalToMinor, percentToBps } from './decimal'
import { calculatePrice, type PricingService } from './pricing'

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
}

export const INVOICE_STATUS_OPTIONS = invoiceStatuses.map((value) => ({
  value,
  label: INVOICE_STATUS_LABELS[value],
}))

export const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ['sent', 'void'],
  sent: ['paid', 'overdue', 'void'],
  overdue: ['paid', 'void'],
  paid: ['sent'],
  void: [],
}

export const canTransition = (from: InvoiceStatus, to: InvoiceStatus) =>
  INVOICE_TRANSITIONS[from].includes(to)

export const invoiceStatusChangeSchema = z.strictObject({
  id: z.string().min(1).max(64),
  status: z.enum(invoiceStatuses),
})

export const MAX_INVOICE_ITEMS = 50
export const DEFAULT_PAYMENT_TERM_DAYS = 14

const isRealDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date')
  .refine(isRealDate, 'Enter a valid date')

const moneySchema = (max: number, label: string) =>
  z
    .string()
    .trim()
    .regex(
      new RegExp(`^\\d{1,${max}}(\\.\\d{1,2})?$`),
      `${label} must be a number with up to two decimals`,
    )
    .transform(decimalToMinor)

export const invoiceItemSchema = z.strictObject({
  description: z
    .string()
    .trim()
    .min(1, 'Description is required')
    .max(500, 'Description must be 500 characters or fewer'),
  quantity: z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, 'Enter a whole number')
    .transform(Number)
    .refine((n) => n >= 1, 'Must be 1 or higher'),
  unitPrice: moneySchema(8, 'Unit price'),
})

export const invoiceSchema = z
  .strictObject({
    id: z.string().min(1).max(64).optional(),
    clientId: z.string().min(1, 'Choose a client').max(64),
    issueDate: dateSchema,
    dueDate: dateSchema,
    taxRate: z
      .string()
      .trim()
      .regex(
        /^\d{1,3}(\.\d{1,2})?$/,
        'Enter a percentage from 0 to 100 with up to two decimals',
      )
      .transform(percentToBps)
      .refine((bps) => bps <= 10000, 'Tax rate cannot be more than 100%'),
    discount: moneySchema(9, 'Discount'),
    items: z
      .array(invoiceItemSchema)
      .min(1, 'Add at least one line item')
      .max(MAX_INVOICE_ITEMS, `Use ${MAX_INVOICE_ITEMS} line items or fewer`),
  })
  .refine((invoice) => invoice.dueDate >= invoice.issueDate, {
    path: ['dueDate'],
    message: 'Due date cannot be before the issue date',
  })

export type InvoiceFormValues = z.input<typeof invoiceSchema>
export type InvoiceData = z.output<typeof invoiceSchema>

export const emptyInvoiceItem: InvoiceFormValues['items'][number] = {
  description: '',
  quantity: '1',
  unitPrice: '',
}

export type InvoiceTotals = {
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
}

export const zeroTotals: InvoiceTotals = {
  subtotal: 0,
  discountAmount: 0,
  taxAmount: 0,
  total: 0,
}

type TotalsItem = { quantity: number; unitPrice: number }

/** Prices invoice lines with the shared pricing function. Every line is a taxable, one-time, fixed-price line. */
export function computeInvoiceTotals(
  items: TotalsItem[],
  taxRateBps: number,
  discount: number,
): InvoiceTotals {
  const services: PricingService[] = items.map((item, index) => ({
    id: String(index),
    name: `Line ${index + 1}`,
    unitPrice: item.unitPrice,
    pricingMode: 'fixed',
    billing: 'one_time',
    minQuantity: 1,
    maxQuantity: null,
    quantityStep: 1,
    taxable: true,
    groups: [],
    options: [],
  }))
  const result = calculatePrice({
    services,
    selections: items.map((item, index) => ({
      serviceId: String(index),
      quantity: item.quantity,
      optionIds: [],
    })),
    taxRateBps,
    discount,
  })
  if (!result.ok) {
    throw new Error(
      `Invoice totals could not be calculated: ${result.errors.map((e) => e.code).join(', ')}`,
    )
  }
  const { subtotal, discountAmount, taxAmount, total } = result
  return { subtotal, discountAmount, taxAmount, total }
}

/** Totals for a form that may be half filled in. Rows that do not parse are skipped. */
export function previewTotals(values: InvoiceFormValues): InvoiceTotals {
  const items = values.items.flatMap((item) => {
    const quantity = invoiceItemSchema.shape.quantity.safeParse(item.quantity)
    const unitPrice = invoiceItemSchema.shape.unitPrice.safeParse(
      item.unitPrice,
    )
    return quantity.success && unitPrice.success
      ? [{ quantity: quantity.data, unitPrice: unitPrice.data }]
      : []
  })
  const taxRate = invoiceSchema.shape.taxRate.safeParse(values.taxRate)
  const discount = invoiceSchema.shape.discount.safeParse(values.discount)
  return computeInvoiceTotals(
    items,
    taxRate.success ? taxRate.data : 0,
    discount.success ? discount.data : 0,
  )
}

export const addDays = (date: string, days: number) => {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

export const todayIso = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
