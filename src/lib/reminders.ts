import type { InvoiceStatus } from '#/db/schema'
import type { InvoiceEmailTemplate } from './email-template'

export const REMINDER_TYPES = ['due_soon', 'overdue_3', 'overdue_10'] as const
export type ReminderType = (typeof REMINDER_TYPES)[number]

export const MAX_REMINDERS_PER_RUN = 40

export const REMINDER_TEMPLATES: Record<ReminderType, InvoiceEmailTemplate> = {
  due_soon: {
    subject: 'Reminder: invoice {{number}} is due on {{dueDate}}',
    body: 'This is a reminder that invoice {{number}} from {{businessName}} is due on {{dueDate}}.\n\nAmount due: {{total}}',
    button: 'View the invoice',
  },
  overdue_3: {
    subject: 'Invoice {{number}} is overdue',
    body: 'Invoice {{number}} from {{businessName}} was due on {{dueDate}} and is now overdue.\n\nAmount due: {{total}}',
    button: 'View the invoice',
  },
  overdue_10: {
    subject: 'Second reminder: invoice {{number}} is overdue',
    body: 'Invoice {{number}} from {{businessName}} was due on {{dueDate}} and is still unpaid.\n\nAmount due: {{total}}',
    button: 'View the invoice',
  },
}

const DAY_MS = 24 * 60 * 60 * 1000

const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  )

/**
 * Picks the reminder an invoice is due for today, if any. The ranges are
 * open-ended where a run may have been cut short by the daily cap, so an
 * invoice left over from one day is still picked up on a later one. Only one
 * type applies at a time, and a type already logged as sent is skipped by the
 * caller.
 */
export function reminderFor(
  status: InvoiceStatus,
  dueDate: string,
  today: string,
): ReminderType | null {
  const daysUntilDue = daysBetween(today, dueDate)
  if (status === 'sent') {
    return daysUntilDue >= 0 && daysUntilDue <= 3 ? 'due_soon' : null
  }
  if (status === 'overdue') {
    const daysLate = -daysUntilDue
    if (daysLate >= 10) return 'overdue_10'
    if (daysLate >= 3) return 'overdue_3'
  }
  return null
}
