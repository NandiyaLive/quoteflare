import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { Db } from '#/db'
import { schema } from '#/db'
import { addDays, DEFAULT_PAYMENT_TERM_DAYS } from '#/lib/invoices'
import { createId } from '#/lib/id'
import {
  calculatePrice,
  type PricingBreakdown,
  type PricingSelection,
} from '#/lib/pricing'
import {
  quoteInvoiceItems,
  type QuoteRequest,
  type QuoteStatusFilter,
} from '#/lib/quotes'
import { loadCalculatorCatalog } from './calculator'
import { batch, isDuplicateNumber } from './invoices'

const { quotes, invoices, invoiceItems, clients, settings } = schema

export type SubmitQuoteResult =
  { ok: true; id: string } | { ok: false; error: string }

export async function submitQuote(
  db: Db,
  request: QuoteRequest,
  verifyHuman: () => Promise<boolean>,
): Promise<SubmitQuoteResult> {
  if (!(await verifyHuman())) {
    return { ok: false, error: 'The spam check failed. Please try again.' }
  }

  const catalog = await loadCalculatorCatalog(db)
  const chosen = new Set(request.selections.map((s) => s.serviceId))
  const byId = new Map(catalog.services.map((s) => [s.id, s]))

  for (const selection of request.selections) {
    const service = byId.get(selection.serviceId)
    const missing = service?.requires.find((id) => !chosen.has(id))
    if (missing) {
      return {
        ok: false,
        error: `${service!.name} needs ${byId.get(missing)?.name ?? 'another service'}.`,
      }
    }
  }

  const selections: PricingSelection[] = request.selections.map((s) => ({
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
  await db.insert(quotes).values({
    id,
    contactName: request.name,
    contactEmail: request.email,
    message: request.message,
    selection: request.selections,
    breakdown,
    currency: catalog.currency,
    total: breakdown.total,
  })
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
  const number = sql<string>`(select ${settings.invoicePrefix} || '-' || ${today.slice(0, 4)} || '-' || printf('%04d', ${settings.nextInvoiceNumber}) from ${settings} where ${settings.id} = 'main')`

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
        dueDate: addDays(today, DEFAULT_PAYMENT_TERM_DAYS),
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
      db
        .update(settings)
        .set({ nextInvoiceNumber: sql`${settings.nextInvoiceNumber} + 1` })
        .where(eq(settings.id, 'main')),
      db
        .update(quotes)
        .set({ status: 'converted' })
        .where(and(eq(quotes.id, quoteId), eq(quotes.status, 'new'))),
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
