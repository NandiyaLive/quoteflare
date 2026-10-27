import { desc, eq } from 'drizzle-orm'
import type { Db } from '#/db'
import { schema } from '#/db'
import { createId } from '#/lib/id'
import {
  calculatePrice,
  type PricingBreakdown,
  type PricingSelection,
} from '#/lib/pricing'
import type { QuoteRequest, QuoteStatusFilter } from '#/lib/quotes'
import { loadCalculatorCatalog } from './calculator'

const { quotes } = schema

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
