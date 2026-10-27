import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '#/db'
import { schema } from '#/db'
import type { InvoiceStatus } from '#/db/schema'
import { formatMinor } from '#/lib/decimal'
import { createId, createPublicToken } from '#/lib/id'
import { EMAILABLE_STATUSES } from '#/lib/invoices'
import { sendEmail } from './email'
import { changeInvoiceStatus, getInvoice } from './invoices'

const { emailLog } = schema

export type InvoiceEmailInput = {
  businessName: string
  number: string
  total: string
  dueDate: string
  url: string
}

export type SendInvoiceResult =
  { ok: true; status: InvoiceStatus; to: string } | { ok: false; error: string }

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

export function buildInvoiceEmail(input: InvoiceEmailInput) {
  const { businessName, number, total, dueDate, url } = input
  const subject = `Invoice ${number} from ${businessName}`
  const text = [
    `Invoice ${number} from ${businessName} is ready.`,
    '',
    `Amount due: ${total}`,
    `Due date: ${dueDate}`,
    '',
    `View the invoice: ${url}`,
  ].join('\n')
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">
<p>Invoice <strong>${escapeHtml(number)}</strong> from ${escapeHtml(businessName)} is ready.</p>
<p>Amount due: <strong>${escapeHtml(total)}</strong><br>Due date: ${escapeHtml(dueDate)}</p>
<p><a href="${escapeHtml(url)}">View the invoice</a></p>
</div>`
  return { subject, text, html }
}

/**
 * Emails the invoice link to the client. A draft becomes `sent` only after
 * Resend accepts the message, so a failed send leaves it a draft.
 */
export async function sendInvoiceEmail(
  db: Db,
  deps: {
    apiKey: string | undefined
    from: string
    origin: string
    fetcher?: typeof fetch
  },
  invoiceId: string,
): Promise<SendInvoiceResult> {
  const detail = await getInvoice(db, invoiceId)
  if (!detail) return { ok: false, error: 'Invoice not found.' }
  const { invoice, client, totals } = detail

  if (!EMAILABLE_STATUSES.includes(invoice.status)) {
    return {
      ok: false,
      error: `A ${invoice.status} invoice cannot be emailed.`,
    }
  }

  const to = (
    await db
      .select({ email: schema.clients.email })
      .from(schema.clients)
      .where(eq(schema.clients.id, client.id))
  )[0]?.email.trim()
  if (!to || !z.email().safeParse(to).success) {
    return { ok: false, error: 'This client has no valid email address.' }
  }

  const settings = await db.query.settings.findFirst()
  const token = invoice.publicToken ?? createPublicToken()
  const message = {
    from: deps.from,
    to,
    replyTo: settings?.replyToEmail || undefined,
    ...buildInvoiceEmail({
      businessName: settings?.businessName ?? '',
      number: invoice.number,
      total: formatMinor(totals.total, invoice.currency),
      dueDate: invoice.dueDate,
      url: `${deps.origin}/i/${token}`,
    }),
  }

  const logId = createId()
  await db.insert(emailLog).values({
    id: logId,
    invoiceId: invoice.id,
    type: 'invoice',
    toAddress: to,
    status: 'pending',
  })

  const sent = await sendEmail(deps.apiKey, message, logId, deps.fetcher)
  if (!sent.ok) {
    await db
      .update(emailLog)
      .set({ status: 'failed', error: sent.error })
      .where(eq(emailLog.id, logId))
    return { ok: false, error: `The email was not sent. ${sent.error}` }
  }

  await db
    .update(emailLog)
    .set({ status: 'sent', providerId: sent.id })
    .where(eq(emailLog.id, logId))

  if (invoice.status !== 'draft')
    return { ok: true, status: invoice.status, to }

  const changed = await changeInvoiceStatus(db, invoice.id, 'sent', token)
  if (!changed.ok) {
    return {
      ok: false,
      error: `The email was sent but the invoice could not be marked as sent. ${changed.error}`,
    }
  }
  return { ok: true, status: 'sent', to }
}
