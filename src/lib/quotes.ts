import { z } from 'zod'
import { quoteStatuses, type RecurringInterval } from '#/db/schema'
import { MAX_ADVANCE_PERCENT, MIN_ADVANCE_PERCENT } from './invoices'
import type { PricedLine, PricingBreakdown } from './pricing'

export const QUOTE_STATUS_FILTERS = ['all', ...quoteStatuses] as const
export type QuoteStatusFilter = (typeof QUOTE_STATUS_FILTERS)[number]

export const QUOTE_STATUS_LABELS = {
  new: 'New',
  converted: 'Converted',
  dismissed: 'Dismissed',
} as const

export const MAX_QUOTE_SERVICES = 100

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

export const quoteRequestSchema = z.strictObject({
  ...quoteDetailsSchema.shape,
  message: messageSchema.default(''),
  turnstileToken: z
    .string()
    .min(1, 'Complete the spam check')
    .max(2048, 'The spam check token is invalid'),
  selections: z
    .array(selectionSchema)
    .min(1, 'Select at least one service')
    .max(MAX_QUOTE_SERVICES),
})

export type QuoteRequest = z.infer<typeof quoteRequestSchema>

export const quoteStatusUpdateSchema = z.object({
  id: z.string().min(1).max(64),
  status: z.enum(['new', 'dismissed']),
})

export const quoteIdSchema = z.strictObject({ id: z.string().min(1).max(64) })

export const convertQuoteSchema = z.strictObject({
  id: z.string().min(1).max(64),
  advancePercent: z
    .number()
    .int()
    .min(MIN_ADVANCE_PERCENT)
    .max(MAX_ADVANCE_PERCENT)
    .nullish(),
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

/** Same line shape as the invoice items, for the recurring lines of one billing interval. */
export function quoteRecurringItems(
  breakdown: PricingBreakdown,
  billing: RecurringInterval,
): QuoteInvoiceItem[] {
  return pricedLineItems(
    breakdown.recurring.lines.filter((line) => line.billing === billing),
  )
}

/** The billing intervals present in a quote's recurring lines, in first-seen order. */
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
