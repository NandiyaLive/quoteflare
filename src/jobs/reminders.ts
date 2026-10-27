import { and, asc, eq, inArray, lte, ne } from 'drizzle-orm'
import { z } from 'zod'
import { schema, type Db } from '#/db'
import { formatMinor } from '#/lib/decimal'
import { createId } from '#/lib/id'
import { addDays, computeInvoiceTotals } from '#/lib/invoices'
import {
  MAX_REMINDERS_PER_RUN,
  REMINDER_TEMPLATES,
  REMINDER_TYPES,
  reminderFor,
  type ReminderType,
} from '#/lib/reminders'
import { sendEmail } from '#/server/email'
import { buildInvoiceEmail } from '#/server/invoice-email'
import { batch } from '#/server/invoices'

const { emailLog, invoices, invoiceItems, clients } = schema

export interface ReminderDeps {
  apiKey: string | undefined
  from: string
  origin: string
  fetcher?: typeof fetch
}

export interface ReminderResult {
  sent: number
  failed: number
}

const NONE: ReminderResult = { sent: 0, failed: 0 }

/**
 * Sends the reminders that are due today. A log row that is not `failed`
 * blocks a repeat, including a `pending` row left by an interrupted run,
 * because a missed reminder is better than a duplicate.
 *
 * The free plan allows 50 subrequests per invocation, so the log rows are
 * written in two batches and only the Resend calls are made one per email.
 */
export async function sendDueReminders(
  db: Db,
  deps: ReminderDeps,
  now: Date,
): Promise<ReminderResult> {
  const settings = await db.query.settings.findFirst()
  if (!settings?.sendReminders) return NONE

  const today = now.toISOString().slice(0, 10)
  const horizon = addDays(today, 3)

  const [candidates, items, logged] = await Promise.all([
    db
      .select({
        id: invoices.id,
        number: invoices.number,
        status: invoices.status,
        dueDate: invoices.dueDate,
        currency: invoices.currency,
        taxRateBps: invoices.taxRateBps,
        discount: invoices.discount,
        publicToken: invoices.publicToken,
        clientEmail: clients.email,
      })
      .from(invoices)
      .innerJoin(clients, eq(clients.id, invoices.clientId))
      .where(
        and(
          inArray(invoices.status, ['sent', 'overdue']),
          lte(invoices.dueDate, horizon),
        ),
      )
      .orderBy(asc(invoices.dueDate), asc(invoices.number)),
    db
      .select({
        invoiceId: invoiceItems.invoiceId,
        quantity: invoiceItems.quantity,
        unitPrice: invoiceItems.unitPrice,
        taxable: invoiceItems.taxable,
      })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoices.id, invoiceItems.invoiceId))
      .where(
        and(
          inArray(invoices.status, ['sent', 'overdue']),
          lte(invoices.dueDate, horizon),
        ),
      ),
    db
      .select({ invoiceId: emailLog.invoiceId, type: emailLog.type })
      .from(emailLog)
      .where(
        and(
          inArray(emailLog.type, [...REMINDER_TYPES]),
          ne(emailLog.status, 'failed'),
        ),
      ),
  ])

  const alreadySent = new Set(logged.map((l) => `${l.invoiceId}:${l.type}`))
  const itemsByInvoice = new Map<string, typeof items>()
  for (const item of items) {
    const list = itemsByInvoice.get(item.invoiceId) ?? []
    list.push(item)
    itemsByInvoice.set(item.invoiceId, list)
  }

  const due: {
    invoice: (typeof candidates)[number]
    type: ReminderType
    to: string
    logId: string
  }[] = []
  for (const invoice of candidates) {
    if (due.length >= MAX_REMINDERS_PER_RUN) break
    const type = reminderFor(invoice.status, invoice.dueDate, today)
    if (!type || alreadySent.has(`${invoice.id}:${type}`)) continue
    const to = invoice.clientEmail.trim()
    if (!invoice.publicToken || !z.email().safeParse(to).success) continue
    due.push({ invoice, type, to, logId: createId() })
  }
  if (due.length === 0) return NONE

  await batch(
    db,
    due.map(({ invoice, type, to, logId }) =>
      db.insert(emailLog).values({
        id: logId,
        invoiceId: invoice.id,
        type,
        toAddress: to,
        status: 'pending',
      }),
    ),
  )

  const outcomes: { logId: string; invoiceId: string; result: SendOutcome }[] =
    []
  for (const { invoice, type, to, logId } of due) {
    const totals = computeInvoiceTotals(
      itemsByInvoice.get(invoice.id) ?? [],
      invoice.taxRateBps,
      invoice.discount,
    )
    const message = {
      from: deps.from,
      to,
      replyTo: settings.replyToEmail || undefined,
      ...(await buildInvoiceEmail(
        {
          businessName: settings.businessName,
          number: invoice.number,
          total: formatMinor(totals.total, invoice.currency),
          dueDate: invoice.dueDate,
          url: `${deps.origin}/i/${invoice.publicToken}`,
        },
        REMINDER_TEMPLATES[type],
      )),
    }
    outcomes.push({
      logId,
      invoiceId: invoice.id,
      result: await sendEmail(deps.apiKey, message, logId, deps.fetcher),
    })
  }

  const sentAt = now.toISOString()
  await batch(
    db,
    outcomes.flatMap(({ logId, invoiceId, result }) =>
      result.ok
        ? [
            db
              .update(emailLog)
              .set({ status: 'sent', providerId: result.id })
              .where(eq(emailLog.id, logId)),
            db
              .update(invoices)
              .set({ lastReminderAt: sentAt })
              .where(eq(invoices.id, invoiceId)),
          ]
        : [
            db
              .update(emailLog)
              .set({ status: 'failed', error: result.error })
              .where(eq(emailLog.id, logId)),
          ],
    ),
  )

  const sent = outcomes.filter((o) => o.result.ok).length
  return { sent, failed: outcomes.length - sent }
}

type SendOutcome = Awaited<ReturnType<typeof sendEmail>>
