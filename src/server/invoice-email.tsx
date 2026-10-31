import { eq, sql } from 'drizzle-orm'
import { render } from '@react-email/render'
import { z } from 'zod'
import type { Db } from '#/db'
import { schema } from '#/db'
import type { InvoiceStatus } from '#/db/schema'
import { displayOf, moneyWithBase } from '#/lib/currencies'
import {
  fillTemplate,
  withDefaults,
  type InvoiceEmailTemplate,
  type TemplateVariables,
} from '#/lib/email-template'
import { InvoiceEmail } from '#/emails/invoice-email'
import { createId, createPublicToken } from '#/lib/id'
import { amountDue, EMAILABLE_STATUSES } from '#/lib/invoices'
import { sendEmail } from './email'
import { changeInvoiceStatus, getInvoice } from './invoices'

const { emailLog } = schema

const IN_FLIGHT_MS = 60_000

export type InvoiceEmailInput = TemplateVariables & { url: string }

export type SendInvoiceResult =
  { ok: true; status: InvoiceStatus; to: string } | { ok: false; error: string }

export async function buildInvoiceEmail(
  input: InvoiceEmailInput,
  template: InvoiceEmailTemplate = withDefaults({
    subject: '',
    body: '',
    button: '',
  }),
) {
  const { url, ...vars } = input
  const subject = fillTemplate(template.subject, vars).replace(/\s+/g, ' ')
  const body = fillTemplate(template.body, vars)
  const buttonLabel = fillTemplate(template.button, vars)
  const element = (
    <InvoiceEmail
      businessName={vars.businessName}
      heading={`Invoice ${vars.number}`}
      body={body}
      buttonLabel={buttonLabel}
      url={url}
      preview={subject}
    />
  )
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ])
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
    ...(await buildInvoiceEmail(
      {
        businessName: settings?.businessName ?? '',
        number: invoice.number,
        total: moneyWithBase(
          invoice.currency,
          displayOf(invoice),
        )(amountDue(totals.total, invoice.advanceBps, invoice.advancePaidAt)),
        dueDate: invoice.dueDate,
        url: `${deps.origin}/i/${token}`,
      },
      withDefaults({
        subject: settings?.invoiceEmailSubject ?? '',
        body: settings?.invoiceEmailBody ?? '',
        button: settings?.invoiceEmailButton ?? '',
      }),
    )),
  }

  // A second click while the first send is in flight would otherwise send a
  // second email, because every send uses its own idempotency key.
  const logId = createId()
  const inFlightSince = new Date(Date.now() - IN_FLIGHT_MS).toISOString()
  const claimed = await db
    .insert(emailLog)
    .select(
      sql`select ${logId}, ${invoice.id}, null, 'invoice', ${to}, 'pending', null, null, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where not exists (select 1 from ${emailLog} where ${emailLog.invoiceId} = ${invoice.id} and ${emailLog.type} = 'invoice' and ${emailLog.status} = 'pending' and ${emailLog.createdAt} > ${inFlightSince})`,
    )
    .returning({ id: emailLog.id })
  if (claimed.length === 0) {
    return {
      ok: false,
      error: 'An email for this invoice is already being sent.',
    }
  }

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
