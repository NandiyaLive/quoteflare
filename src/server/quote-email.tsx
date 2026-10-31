import { and, eq, isNull } from 'drizzle-orm'
import { render } from '@react-email/render'
import type { Db } from '#/db'
import { schema } from '#/db'
import { formatMinor } from '#/lib/decimal'
import { QuoteEmail, type QuoteEmailProps } from '#/emails/quote-email'
import { createId, createPublicToken } from '#/lib/id'
import { sendEmail, type EmailMessage } from './email'
import { z } from 'zod'
import { addDays, toIsoDate } from '#/lib/invoices'
import { getQuote, markQuoteSent } from './quotes'

const { emailLog } = schema

export type QuoteEmailDeps = {
  apiKey: string | undefined
  from: string
  origin: string
  fetcher?: typeof fetch
}

async function build(
  props: QuoteEmailProps,
): Promise<Pick<EmailMessage, 'html' | 'text'>> {
  const element = <QuoteEmail {...props} />
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ])
  return { html, text }
}

async function deliver(
  db: Db,
  deps: QuoteEmailDeps,
  quoteId: string,
  type:
    | 'quote_confirmation'
    | 'quote_notification'
    | 'quote_link'
    | 'quote_response',
  message: EmailMessage,
) {
  const logId = createId()
  await db.insert(emailLog).values({
    id: logId,
    quoteId,
    type,
    toAddress: message.to,
    status: 'pending',
  })
  const sent = await sendEmail(deps.apiKey, message, logId, deps.fetcher)
  await db
    .update(emailLog)
    .set(
      sent.ok
        ? { status: 'sent', providerId: sent.id }
        : { status: 'failed', error: sent.error },
    )
    .where(eq(emailLog.id, logId))
}

/**
 * Emails the visitor a copy of their request and the business a notice with a
 * link to the admin page. It never throws: the quote is already saved, so a
 * failed send is recorded in the email log and nothing else.
 */
export async function sendQuoteEmails(
  db: Db,
  deps: QuoteEmailDeps,
  quoteId: string,
): Promise<void> {
  try {
    const quote = await getQuote(db, quoteId)
    const settings = await db.query.settings.findFirst()
    if (!quote || !settings) return

    const label = quote.number ?? 'Quote request'
    const lines = (quote.breakdown?.lines ?? []).map((line) => ({
      description: line.name,
      quantity: line.quantity,
      amount: formatMinor(line.amount, quote.currency),
    }))
    const total = formatMinor(quote.total, quote.currency)
    const businessName = settings.businessName

    await deliver(db, deps, quote.id, 'quote_confirmation', {
      from: deps.from,
      to: quote.contactEmail,
      replyTo: settings.replyToEmail || settings.email || undefined,
      subject: `We received your quote request ${label}`,
      ...(await build({
        businessName,
        heading: label,
        intro: `Thanks, ${quote.contactName}. ${businessName} received your request and will reply by email.\n\nThis estimate may change when we review it.`,
        lines,
        total,
        preview: `We received your quote request ${label}`,
      })),
    })

    const notifyTo = settings.email.trim()
    if (!notifyTo) return
    await deliver(db, deps, quote.id, 'quote_notification', {
      from: deps.from,
      to: notifyTo,
      replyTo: quote.contactEmail,
      subject: `New quote request ${label} from ${quote.contactName}`.replace(
        /\s+/g,
        ' ',
      ),
      ...(await build({
        businessName,
        heading: label,
        intro: `${quote.contactName} (${quote.contactEmail}) sent a quote request.${quote.message ? `\n\n${quote.message}` : ''}`,
        lines,
        total,
        buttonLabel: 'Open the quote',
        url: `${deps.origin}/admin/quotes/${quote.id}`,
        preview: `New quote request ${label}`,
      })),
    })
  } catch (error) {
    console.error('quote email failed', error)
  }
}

export type SendQuoteResult =
  { ok: true; to: string; validUntil: string } | { ok: false; error: string }

/**
 * Emails the client a link to the public quote page. The quote becomes `sent`
 * only after Resend accepts the message, so a failed send changes nothing.
 */
export async function sendQuoteToClient(
  db: Db,
  deps: QuoteEmailDeps,
  quoteId: string,
  now: Date = new Date(),
): Promise<SendQuoteResult> {
  const quote = await getQuote(db, quoteId)
  if (!quote) return { ok: false, error: 'Quote not found.' }
  if (!['new', 'sent', 'expired'].includes(quote.status)) {
    return { ok: false, error: `A ${quote.status} quote cannot be sent.` }
  }
  if (!quote.breakdown || quote.breakdown.lines.length === 0) {
    return { ok: false, error: 'This quote has no items to send.' }
  }
  const to = quote.contactEmail.trim()
  if (!z.email().safeParse(to).success) {
    return { ok: false, error: 'This quote has no valid email address.' }
  }
  const settings = await db.query.settings.findFirst()
  if (!settings) {
    return { ok: false, error: 'Save your business details in settings first.' }
  }

  const today = toIsoDate(now)
  // The token is final once stored, so reuse it when the quote was sent before.
  const token = quote.publicToken ?? createPublicToken()
  const label = quote.number ?? 'Quote'
  const lines = quote.breakdown.lines.map((line) => ({
    description: line.name,
    quantity: line.quantity,
    amount: formatMinor(line.amount, quote.currency),
  }))
  const validUntil = addDays(today, settings.quoteValidityDays)
  const businessName = settings.businessName

  await db
    .update(schema.quotes)
    .set({ publicToken: token })
    .where(
      and(eq(schema.quotes.id, quote.id), isNull(schema.quotes.publicToken)),
    )

  const logId = createId()
  await db.insert(emailLog).values({
    id: logId,
    quoteId: quote.id,
    type: 'quote_link',
    toAddress: to,
    status: 'pending',
  })
  const message: EmailMessage = {
    from: deps.from,
    to,
    replyTo: settings.replyToEmail || settings.email || undefined,
    subject: `Your quote ${label} from ${businessName}`.replace(/\s+/g, ' '),
    ...(await build({
      businessName,
      heading: label,
      intro: `Hi ${quote.contactName}, your quote is ready. It is valid until ${validUntil}. You can accept or decline it online.`,
      lines,
      total: formatMinor(quote.total, quote.currency),
      buttonLabel: 'View the quote',
      url: `${deps.origin}/q/${token}`,
      preview: `Your quote ${label} from ${businessName}`,
    })),
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

  const marked = await markQuoteSent(
    db,
    quote.id,
    today,
    settings.quoteValidityDays,
  )
  if (!marked.ok) {
    return {
      ok: false,
      error: `The email was sent but the quote could not be marked as sent. ${marked.error}`,
    }
  }
  return { ok: true, to, validUntil: marked.validUntil }
}

/** Tells the business that the client accepted or declined. Never throws. */
export async function sendQuoteResponseEmail(
  db: Db,
  deps: QuoteEmailDeps,
  quoteId: string,
): Promise<void> {
  try {
    const quote = await getQuote(db, quoteId)
    const settings = await db.query.settings.findFirst()
    const to = settings?.email.trim()
    if (!quote || !settings || !to) return
    const label = quote.number ?? 'Quote'
    const verb = quote.status === 'accepted' ? 'accepted' : 'declined'
    await deliver(db, deps, quote.id, 'quote_response', {
      from: deps.from,
      to,
      replyTo: quote.contactEmail,
      subject: `${quote.contactName} ${verb} quote ${label}`.replace(
        /\s+/g,
        ' ',
      ),
      ...(await build({
        businessName: settings.businessName,
        heading: `${label} ${verb}`,
        intro: `${quote.contactName} (${quote.contactEmail}) ${verb} the quote.`,
        lines: [],
        total: formatMinor(quote.total, quote.currency),
        buttonLabel: 'Open the quote',
        url: `${deps.origin}/admin/quotes/${quote.id}`,
        preview: `${quote.contactName} ${verb} quote ${label}`,
      })),
    })
  } catch (error) {
    console.error('quote response email failed', error)
  }
}
