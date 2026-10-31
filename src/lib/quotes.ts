import { z } from 'zod'
import { decimalToMinor, minorToDecimal } from './decimal'
import { totalsFor } from './pricing'
import {
  quoteStatuses,
  type QuoteStatus,
  type RecurringInterval,
} from '#/db/schema'
import {
  dateSchema,
  MAX_ADVANCE_PERCENT,
  MIN_ADVANCE_PERCENT,
} from './invoices'
import type { PricedLine, PricingBreakdown } from './pricing'

export const QUOTE_EVENT_LABELS = {
  received: 'Request received',
  created: 'Created by you',
  edited: 'Edited',
  sent: 'Sent to the client',
  reminded: 'Reminder sent',
  accepted: 'Accepted by the client',
  declined: 'Declined by the client',
  expired: 'Expired',
  dismissed: 'Dismissed',
  reopened: 'Reopened',
  converted: 'Turned into an invoice',
} as const

const QUOTE_STATUS_FILTERS = ['all', ...quoteStatuses] as const
export type QuoteStatusFilter = (typeof QUOTE_STATUS_FILTERS)[number]

export const QUOTE_STATUS_LABELS = {
  new: 'New',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  converted: 'Converted',
  dismissed: 'Dismissed',
} as const

const MAX_QUOTE_SERVICES = 100

export const MAX_PUBLIC_BODY_BYTES = 64 * 1024

const selectionSchema = z.strictObject({
  serviceId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(1_000_000),
  optionIds: z.array(z.string().min(1).max(64)).max(50),
})

const messageSchema = z
  .string()
  .trim()
  .max(2000, 'Message must be 2000 characters or fewer')

export const quoteDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter your name')
    .max(120, 'Name must be 120 characters or fewer'),
  email: z
    .string()
    .trim()
    .max(254, 'Email must be 254 characters or fewer')
    .pipe(z.email('Enter a valid email address')),
  message: messageSchema,
})

export const quoteFormSchema = quoteDetailsSchema.extend({
  website: z.string().max(200),
})

export const quoteRequestSchema = z.strictObject({
  ...quoteDetailsSchema.shape,
  // Hidden form field. People leave it empty and form-filling bots do not.
  website: z.string().max(200).optional(),
  message: messageSchema.default(''),
  turnstileToken: z
    .string()
    .min(1, 'Complete the spam check')
    .max(2048, 'The spam check token is invalid'),
  selections: z
    .array(selectionSchema)
    .min(1, 'Select at least one service')
    .max(MAX_QUOTE_SERVICES),
  // Currency the visitor viewed prices in. The server checks it against the
  // approved list and ignores it otherwise.
  displayCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
})

export type QuoteRequest = z.infer<typeof quoteRequestSchema>

export const quoteStatusUpdateSchema = z.object({
  id: z.string().min(1).max(64),
  status: z.enum(['new', 'dismissed']),
})

export const convertQuoteSchema = z.strictObject({
  id: z.string().min(1).max(64),
  today: dateSchema,
  advancePercent: z
    .number()
    .int()
    .min(MIN_ADVANCE_PERCENT)
    .max(MAX_ADVANCE_PERCENT)
    .nullish(),
})

/** Statuses a client may see through the public link. */
export const PUBLIC_QUOTE_STATUSES = [
  'sent',
  'accepted',
  'declined',
  'expired',
  'converted',
] as const satisfies readonly QuoteStatus[]

/** Statuses an admin may still send to the client or turn into an invoice. */
export const SENDABLE_QUOTE_STATUSES = [
  'new',
  'sent',
  'expired',
] as const satisfies readonly QuoteStatus[]

export const INVOICEABLE_QUOTE_STATUSES = [
  'new',
  'sent',
  'accepted',
  'expired',
] as const satisfies readonly QuoteStatus[]

export const quoteResponseSchema = z.strictObject({
  token: z.string().min(1).max(64),
  response: z.enum(['accepted', 'declined']),
})

export const sendQuoteSchema = z.strictObject({
  id: z.string().min(1).max(64),
})

export const bulkDismissSchema = z.strictObject({
  ids: z.array(z.string().min(1).max(64)).min(1).max(100),
})

export const quoteFilterSchema = z.object({
  status: z.enum(QUOTE_STATUS_FILTERS).catch('all'),
})

export type QuoteInvoiceItem = {
  description: string
  quantity: number
  unitPrice: number
  taxable: boolean
}

/**
 * One invoice line per priced service, plus one single-quantity line per
 * chosen option, so the invoice subtotal equals the quote subtotal. Recurring
 * lines are left out because the quote total excludes them too. Options
 * share the taxable flag of their service.
 */
export function quoteInvoiceItems(
  breakdown: PricingBreakdown,
): QuoteInvoiceItem[] {
  return pricedLineItems(breakdown.lines)
}

export function quoteRecurringItems(
  breakdown: PricingBreakdown,
  billing: RecurringInterval,
): QuoteInvoiceItem[] {
  return pricedLineItems(
    breakdown.recurring.lines.filter((line) => line.billing === billing),
  )
}

export function quoteRecurringIntervals(
  breakdown: PricingBreakdown,
): RecurringInterval[] {
  return [
    ...new Set(
      breakdown.recurring.lines.flatMap((line) =>
        line.billing === 'one_time' ? [] : [line.billing],
      ),
    ),
  ]
}

function pricedLineItems(lines: PricedLine[]): QuoteInvoiceItem[] {
  return lines.flatMap((line) => [
    {
      description: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxable: line.taxable,
    },
    ...line.options.map((option) => ({
      description: `${line.name}: ${option.name}`,
      quantity: 1,
      unitPrice: option.amount,
      taxable: line.taxable,
    })),
  ])
}

/** Statuses where the admin may still change prices and items. */
export const EDITABLE_QUOTE_STATUSES = [
  'new',
  'sent',
  'expired',
] as const satisfies readonly QuoteStatus[]

export const MAX_QUOTE_ITEMS = 50

const editMoney = (max: number, label: string) =>
  z
    .string()
    .trim()
    .regex(
      new RegExp(`^\\d{1,${max}}(\\.\\d{1,2})?$`),
      `${label} must be a number with up to two decimals`,
    )
    .transform(decimalToMinor)

export const quoteEditItemSchema = z.strictObject({
  description: z
    .string()
    .trim()
    .min(1, 'Description is required')
    .max(500, 'Description must be 500 characters or fewer'),
  quantity: z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, 'Quantity must be a whole number')
    .transform(Number)
    .refine((n) => n >= 1, 'Quantity must be 1 or higher'),
  unitPrice: editMoney(8, 'Unit price'),
  taxable: z.boolean(),
})

export const quoteEditSchema = z.strictObject({
  id: z.string().min(1).max(64),
  items: z
    .array(quoteEditItemSchema)
    .min(1, 'Keep at least one item')
    .max(MAX_QUOTE_ITEMS, `Use ${MAX_QUOTE_ITEMS} items or fewer`),
  discount: editMoney(9, 'Discount'),
  adminNote: z
    .string()
    .trim()
    .max(2000, 'Note must be 2000 characters or fewer'),
})

export type QuoteEditInput = z.infer<typeof quoteEditSchema>

/** A quote the admin writes from scratch, for a client who did not use the calculator. */
export const quoteCreateSchema = quoteEditSchema
  .omit({ id: true })
  .extend(quoteDetailsSchema.pick({ name: true, email: true }).shape)

export type QuoteCreateInput = z.infer<typeof quoteCreateSchema>

/**
 * Rebuilds a quote's one-time lines from edited items and totals them again.
 * Each item becomes a plain line, so options fold into the items the admin
 * saw in the editor. Recurring lines stay as they were.
 */
export function repriceQuote(
  edit: Pick<QuoteEditInput, 'items' | 'discount'>,
  recurring: PricedLine[],
  taxRateBps: number,
  makeId: () => string,
): PricingBreakdown {
  const lines: PricedLine[] = edit.items.map((item) => ({
    serviceId: `item-${makeId()}`,
    name: item.description,
    billing: 'one_time',
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    baseAmount: item.unitPrice * item.quantity,
    options: [],
    amount: item.unitPrice * item.quantity,
    taxable: item.taxable,
  }))
  return totalsFor(lines, recurring, taxRateBps, edit.discount)
}

const CSV_HEADER = [
  'Number',
  'Received',
  'Name',
  'Email',
  'Status',
  'Currency',
  'Total',
  'Valid until',
  'Message',
]

// A cell that starts with one of these runs as a formula in spreadsheets.
const csvCell = (value: string) => {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function quotesToCsv(
  rows: {
    number: string | null
    createdAt: string
    contactName: string
    contactEmail: string
    status: QuoteStatus
    currency: string
    total: number
    validUntil: string | null
    message: string
  }[],
): string {
  const lines = rows.map((row) =>
    [
      row.number ?? '',
      row.createdAt,
      row.contactName,
      row.contactEmail,
      QUOTE_STATUS_LABELS[row.status],
      row.currency,
      minorToDecimal(row.total),
      row.validUntil ?? '',
      row.message,
    ]
      .map(csvCell)
      .join(','),
  )
  return [CSV_HEADER.join(','), ...lines].join('\r\n')
}
