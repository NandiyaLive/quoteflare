import { z } from 'zod'
import { recurringIntervals, type RecurringInterval } from '#/db/schema'
import { addDays, dateSchema, invoiceItemSchema } from './invoices'

export const RECURRING_INTERVAL_LABELS: Record<RecurringInterval, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

export const MAX_RECURRING_ITEMS = 50

const MONTHS_PER_INTERVAL = { monthly: 1, quarterly: 3, yearly: 12 } as const

function addMonths(date: string, months: number) {
  const [year, month, day] = date.split('-').map(Number)
  const index = year * 12 + (month - 1) + months
  const targetYear = Math.floor(index / 12)
  const targetMonth = index % 12
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate()
  const value = new Date(
    Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)),
  )
  return value.toISOString().slice(0, 10)
}

export function addInterval(date: string, interval: RecurringInterval) {
  return interval === 'weekly'
    ? addDays(date, 7)
    : addMonths(date, MONTHS_PER_INTERVAL[interval])
}

/** The first run date after `today`, stepping from `from` one interval at a time. */
export function nextRunAfter(
  from: string,
  interval: RecurringInterval,
  today: string,
) {
  let next = addInterval(from, interval)
  while (next <= today) next = addInterval(next, interval)
  return next
}

export const recurringSchema = z.strictObject({
  id: z.string().min(1).max(64).optional(),
  clientId: z.string().min(1, 'Choose a client').max(64),
  interval: z.enum(recurringIntervals),
  nextRunDate: dateSchema,
  autoSend: z.boolean(),
  items: z
    .array(invoiceItemSchema)
    .min(1, 'Add at least one line item')
    .max(MAX_RECURRING_ITEMS, `Use ${MAX_RECURRING_ITEMS} line items or fewer`),
})

export type RecurringFormValues = z.input<typeof recurringSchema>
export type RecurringData = z.output<typeof recurringSchema>

export const recurringActiveSchema = z.strictObject({
  id: z.string().min(1).max(64),
  active: z.boolean(),
})
