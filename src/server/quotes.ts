import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm'
import type { Db } from '#/db'
import { schema } from '#/db'
import type { RecurringInterval } from '#/db/schema'
import { missingIncluded } from '#/lib/calculator'
import { minorToDecimal } from '#/lib/decimal'
import { addDays } from '#/lib/invoices'
import { createId, createPublicToken, isPublicToken } from '#/lib/id'
import {
  calculatePrice,
  type PricingBreakdown,
  type PricingSelection,
} from '#/lib/pricing'
import type { RecurringFormValues } from '#/lib/recurring'
import {
  INVOICEABLE_QUOTE_STATUSES,
  PUBLIC_QUOTE_STATUSES,
  SENDABLE_QUOTE_STATUSES,
  quoteInvoiceItems,
  quoteRecurringItems,
  type QuoteRequest,
  type QuoteStatusFilter,
} from '#/lib/quotes'
import { loadCalculatorCatalog } from './calculator'
import {
  batch,
  incrementInvoiceNumber,
  invoiceNumberSql,
  isDuplicateNumber,
} from './invoices'

const { quotes, invoices, invoiceItems, clients, settings } = schema

// Reads and increments the same row inside one batch, so two requests cannot
// receive the same number. Without a settings row the number stays null.
const quoteNumberSql = sql<string>`(select 'QUO-' || printf('%04d', ${settings.nextQuoteNumber}) from ${settings} where ${settings.id} = 'main')`

export type SubmitQuoteResult =
  { ok: true; id: string } | { ok: false; error: string }

export async function submitQuote(
  db: Db,
  request: QuoteRequest,
  verifyHuman: () => Promise<boolean>,
  onCreated?: (id: string) => Promise<void>,
): Promise<SubmitQuoteResult> {
  if (!(await verifyHuman())) {
    return { ok: false, error: 'The spam check failed. Please try again.' }
  }

  const catalog = await loadCalculatorCatalog(db)
  const chosenIds = new Set(request.selections.map((s) => s.serviceId))
  const requested = [
    ...request.selections,
    ...missingIncluded(catalog, chosenIds),
  ]
  const chosen = new Set(requested.map((s) => s.serviceId))
  const byId = new Map(catalog.services.map((s) => [s.id, s]))

  for (const selection of requested) {
    const service = byId.get(selection.serviceId)
    const missing = service?.requires.find((id) => !chosen.has(id))
    if (missing) {
      return {
        ok: false,
        error: `${service!.name} needs ${byId.get(missing)?.name ?? 'another service'}.`,
      }
    }
  }

  const selections: PricingSelection[] = requested.map((s) => ({
    ...s,
    optionIds: [...s.optionIds],
  }))
  const result = calculatePrice({
    services: catalog.services,
    selections,
    taxRateBps: catalog.taxRateBps,
    discount: 0,
  })
  if (!result.ok) {
    return {
      ok: false,
      error:
        'Some of your selections are no longer valid. Reload and try again.',
    }
  }

  const breakdown: PricingBreakdown = {
    lines: result.lines,
    subtotal: result.subtotal,
    discountAmount: result.discountAmount,
    taxAmount: result.taxAmount,
    total: result.total,
    recurring: result.recurring,
  }
  const id = createId()
  await batch(db, [
    db.insert(quotes).values({
      id,
      number: quoteNumberSql,
      contactName: request.name,
      contactEmail: request.email,
      message: request.message,
      selection: requested,
      breakdown,
      currency: catalog.currency,
      total: breakdown.total,
    }),
    db
      .update(settings)
      .set({ nextQuoteNumber: sql`${settings.nextQuoteNumber} + 1` })
      .where(eq(settings.id, 'main')),
  ])
  await onCreated?.(id)
  return { ok: true, id }
}

export async function listQuotes(db: Db, status: QuoteStatusFilter) {
  return db
    .select()
    .from(quotes)
    .where(status === 'all' ? undefined : eq(quotes.status, status))
    .orderBy(desc(quotes.createdAt), desc(quotes.id))
}

export type QuoteRow = Awaited<ReturnType<typeof listQuotes>>[number]

export async function getQuote(db: Db, id: string) {
  return (await db.select().from(quotes).where(eq(quotes.id, id)).limit(1))[0]
}

export async function setQuoteStatus(
  db: Db,
  id: string,
  status: 'new' | 'dismissed',
): Promise<boolean> {
  const current = await getQuote(db, id)
  if (!current || current.status === 'converted') return false
  await db.update(quotes).set({ status }).where(eq(quotes.id, id))
  return true
}

export type ConvertQuoteResult =
  | { ok: true; invoiceId: string; created: boolean }
  | { ok: false; error: string }

export async function getQuoteInvoice(db: Db, quoteId: string) {
  return (
    await db
      .select({ id: invoices.id, number: invoices.number })
      .from(invoices)
      .where(eq(invoices.sourceQuoteId, quoteId))
      .limit(1)
  )[0]
}

export async function convertQuoteToInvoice(
  db: Db,
  quoteId: string,
  today: string,
  advancePercent?: number | null,
): Promise<ConvertQuoteResult> {
  const quote = await getQuote(db, quoteId)
  if (!quote) return { ok: false, error: 'Quote not found.' }

  const existing = await getQuoteInvoice(db, quoteId)
  if (existing) return { ok: true, invoiceId: existing.id, created: false }

  if (quote.status === 'dismissed') {
    return { ok: false, error: 'Reopen this quote before creating an invoice.' }
  }
  if (!quote.breakdown || quote.breakdown.lines.length === 0) {
    return {
      ok: false,
      error: 'This quote has no one-time items to invoice.',
    }
  }
  const business = await db.query.settings.findFirst()
  if (!business) {
    return {
      ok: false,
      error: 'Save your business details in settings before creating invoices.',
    }
  }

  const matches = await db
    .select()
    .from(clients)
    .where(sql`lower(${clients.email}) = lower(${quote.contactEmail})`)
    .orderBy(asc(clients.archived), asc(clients.id))
  const client = matches[0]
  if (client?.archived) {
    return {
      ok: false,
      error: `${client.name} is archived. Restore the client before creating an invoice.`,
    }
  }

  const clientId = client?.id ?? createId()
  const invoiceId = createId()
  const items = quoteInvoiceItems(quote.breakdown)
  const number = invoiceNumberSql(today)

  try {
    await batch(db, [
      ...(client
        ? []
        : [
            db.insert(clients).values({
              id: clientId,
              name: quote.contactName,
              email: quote.contactEmail,
            }),
          ]),
      db.insert(invoices).values({
        id: invoiceId,
        number,
        clientId,
        sourceQuoteId: quoteId,
        advanceBps: advancePercent ? advancePercent * 100 : null,
        issueDate: today,
        dueDate: addDays(today, business.paymentTermDays),
        currency: quote.currency,
        taxRateBps: business.taxRateBps,
      }),
      ...items.map((item, index) =>
        db.insert(invoiceItems).values({
          invoiceId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          sortOrder: index,
          taxable: item.taxable,
        }),
      ),
      incrementInvoiceNumber(db),
      db
        .update(quotes)
        .set({ status: 'converted' })
        .where(
          and(
            eq(quotes.id, quoteId),
            inArray(quotes.status, [...INVOICEABLE_QUOTE_STATUSES]),
          ),
        ),
    ])
  } catch (error) {
    if (isDuplicateNumber(error)) {
      return {
        ok: false,
        error:
          'That invoice number is already used. Raise the next invoice number in settings.',
      }
    }
    if (
      String((error as { cause?: unknown })?.cause ?? error).includes(
        'invoices.source_quote_id',
      )
    ) {
      const winner = await getQuoteInvoice(db, quoteId)
      if (winner) return { ok: true, invoiceId: winner.id, created: false }
    }
    throw error
  }
  return { ok: true, invoiceId, created: true }
}

export type QuoteSchedulePrefill = {
  quoteId: string
  contactName: string
  contactEmail: string
  clientMissing: boolean
  values: RecurringFormValues
}

export async function getQuoteSchedulePrefill(
  db: Db,
  quoteId: string,
  interval: RecurringInterval,
  today: string,
): Promise<QuoteSchedulePrefill | null> {
  const quote = await getQuote(db, quoteId)
  if (!quote?.breakdown) return null
  const items = quoteRecurringItems(quote.breakdown, interval)
  if (items.length === 0) return null

  const client = (
    await db
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(
          sql`lower(${clients.email}) = lower(${quote.contactEmail})`,
          eq(clients.archived, false),
        ),
      )
      .orderBy(asc(clients.id))
      .limit(1)
  )[0]

  return {
    quoteId,
    contactName: quote.contactName,
    contactEmail: quote.contactEmail,
    clientMissing: !client,
    values: {
      clientId: client?.id ?? '',
      interval,
      nextRunDate: today,
      autoSend: false,
      items: items.map((item) => ({
        description: item.description,
        quantity: String(item.quantity),
        unitPrice: minorToDecimal(item.unitPrice),
        taxable: item.taxable,
      })),
    },
  }
}

export type MarkSentResult =
  { ok: true; token: string; validUntil: string } | { ok: false; error: string }

/**
 * Opens the quote to the client: it gets a public token, a validity date and
 * the `sent` status. Call it after the email left, so a failed send changes
 * nothing.
 */
export async function markQuoteSent(
  db: Db,
  quoteId: string,
  today: string,
  validityDays: number,
): Promise<MarkSentResult> {
  const token = createPublicToken()
  const validUntil = addDays(today, validityDays)
  const [row] = await db
    .update(quotes)
    .set({
      status: 'sent',
      publicToken: sql`coalesce(${quotes.publicToken}, ${token})`,
      validUntil,
      sentAt: new Date().toISOString(),
      respondedAt: null,
    })
    .where(
      and(
        eq(quotes.id, quoteId),
        inArray(quotes.status, [...SENDABLE_QUOTE_STATUSES]),
      ),
    )
    .returning({ token: quotes.publicToken })
  if (!row?.token) {
    return { ok: false, error: 'This quote can no longer be sent.' }
  }
  return { ok: true, token: row.token, validUntil }
}

export type PublicQuote = {
  quote: {
    number: string | null
    status: (typeof PUBLIC_QUOTE_STATUSES)[number]
    validUntil: string | null
    currency: string
    total: number
  }
  contactName: string
  breakdown: PricingBreakdown
  business: { name: string; address: string; email: string; hasLogo: boolean }
}

const isLapsed = (
  quote: { status: string; validUntil: string | null },
  today: string,
) =>
  quote.status === 'sent' &&
  quote.validUntil !== null &&
  quote.validUntil < today

export async function getPublicQuote(
  db: Db,
  token: string,
  today: string,
): Promise<PublicQuote | null> {
  if (!isPublicToken(token)) return null
  const [quote] = await db
    .select()
    .from(quotes)
    .where(
      and(
        eq(quotes.publicToken, token),
        inArray(quotes.status, [...PUBLIC_QUOTE_STATUSES]),
      ),
    )
    .limit(1)
  if (!quote?.breakdown) return null

  const business = await db.query.settings.findFirst()
  return {
    quote: {
      number: quote.number,
      // The daily job flips lapsed quotes to `expired`; until it runs, the
      // page must not let the client accept one.
      status: isLapsed(quote, today)
        ? 'expired'
        : (quote.status as PublicQuote['quote']['status']),
      validUntil: quote.validUntil,
      currency: quote.currency,
      total: quote.total,
    },
    contactName: quote.contactName,
    breakdown: quote.breakdown,
    business: {
      name: business?.businessName ?? '',
      address: business?.address ?? '',
      email: business?.email ?? '',
      hasLogo: Boolean(business?.logoKey),
    },
  }
}

export type RespondResult =
  | { ok: true; id: string; status: 'accepted' | 'declined' }
  | { ok: false; error: string }

export async function respondToQuote(
  db: Db,
  token: string,
  response: 'accepted' | 'declined',
  today: string,
): Promise<RespondResult> {
  if (!isPublicToken(token)) return { ok: false, error: 'Quote not found.' }
  const [updated] = await db
    .update(quotes)
    .set({ status: response, respondedAt: new Date().toISOString() })
    .where(
      and(
        eq(quotes.publicToken, token),
        eq(quotes.status, 'sent'),
        or(isNull(quotes.validUntil), gte(quotes.validUntil, today)),
      ),
    )
    .returning({ id: quotes.id })
  if (updated) return { ok: true, id: updated.id, status: response }

  const [quote] = await db
    .select({ status: quotes.status, validUntil: quotes.validUntil })
    .from(quotes)
    .where(
      and(
        eq(quotes.publicToken, token),
        inArray(quotes.status, [...PUBLIC_QUOTE_STATUSES]),
      ),
    )
    .limit(1)
  if (!quote) return { ok: false, error: 'Quote not found.' }
  if (quote.status === 'expired' || isLapsed(quote, today)) {
    return {
      ok: false,
      error: 'This quote has expired. Ask us for a new one.',
    }
  }
  return {
    ok: false,
    error: 'This quote has already been answered.',
  }
}

/** Marks sent quotes past their validity date as expired. */
export async function expireQuotes(db: Db, today: string): Promise<number> {
  const rows = await db
    .update(quotes)
    .set({ status: 'expired' })
    .where(and(eq(quotes.status, 'sent'), lt(quotes.validUntil, today)))
    .returning({ id: quotes.id })
  return rows.length
}
