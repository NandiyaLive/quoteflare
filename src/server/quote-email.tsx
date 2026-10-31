import { eq } from 'drizzle-orm'
import { render } from '@react-email/render'
import type { Db } from '#/db'
import { schema } from '#/db'
import { formatMinor } from '#/lib/decimal'
import { QuoteEmail, type QuoteEmailProps } from '#/emails/quote-email'
import { createId } from '#/lib/id'
import { sendEmail, type EmailMessage } from './email'
import { getQuote } from './quotes'

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
  type: 'quote_confirmation' | 'quote_notification',
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
