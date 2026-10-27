import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Db } from '#/db'
import { schema } from '#/db'
import type { InvoiceStatus } from '#/db/schema'
import {
  canTransition,
  computeInvoiceTotals,
  type InvoiceData,
  type InvoiceTotals,
} from '#/lib/invoices'
import { createId, createPublicToken, isPublicToken } from '#/lib/id'

const { invoices, invoiceItems, clients, settings } = schema

export type InvoiceListRow = {
  id: string
  number: string
  clientId: string
  clientName: string
  clientCompany: string
  status: InvoiceStatus
  issueDate: string
  dueDate: string
  currency: string
} & InvoiceTotals

export type InvoiceItemRow = {
  id: string
  description: string
  quantity: number
  unitPrice: number
  taxable: boolean
}

export type InvoiceDetail = {
  invoice: typeof invoices.$inferSelect
  client: { id: string; name: string; company: string; archived: boolean }
  items: InvoiceItemRow[]
  totals: InvoiceTotals
}

export type PublicInvoice = {
  invoice: {
    number: string
    status: InvoiceStatus
    issueDate: string
    dueDate: string
    currency: string
    taxRateBps: number
  }
  client: { name: string; company: string; email: string; address: string }
  business: {
    name: string
    address: string
    email: string
    paymentInstructions: string
    bank: {
      name: string
      branch: string
      accountName: string
      accountNumber: string
      swiftCode: string
    }
    hasLogo: boolean
  }
  items: InvoiceItemRow[]
  totals: InvoiceTotals
}

export type ChangeStatusResult =
  | { ok: true; status: InvoiceStatus; publicToken: string | null }
  | { ok: false; error: string }

export type SaveInvoiceResult =
  { ok: true; id: string; number: string } | { ok: false; error: string }

export const batch = (db: Db, statements: BatchItem<'sqlite'>[]) =>
  db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

export async function listInvoices(db: Db): Promise<InvoiceListRow[]> {
  const [rows, items] = await Promise.all([
    db
      .select({
        id: invoices.id,
        number: invoices.number,
        clientId: invoices.clientId,
        clientName: clients.name,
        clientCompany: clients.company,
        status: invoices.status,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        currency: invoices.currency,
        taxRateBps: invoices.taxRateBps,
        discount: invoices.discount,
      })
      .from(invoices)
      .innerJoin(clients, eq(clients.id, invoices.clientId))
      .orderBy(desc(invoices.issueDate), desc(invoices.number)),
    db
      .select({
        invoiceId: invoiceItems.invoiceId,
        quantity: invoiceItems.quantity,
        unitPrice: invoiceItems.unitPrice,
        taxable: invoiceItems.taxable,
      })
      .from(invoiceItems),
  ])

  const byInvoice = new Map<
    string,
    { quantity: number; unitPrice: number; taxable: boolean }[]
  >()
  for (const item of items) {
    const list = byInvoice.get(item.invoiceId) ?? []
    list.push(item)
    byInvoice.set(item.invoiceId, list)
  }

  return rows.map(({ taxRateBps, discount, ...row }) => ({
    ...row,
    ...computeInvoiceTotals(byInvoice.get(row.id) ?? [], taxRateBps, discount),
  }))
}

export async function getInvoice(
  db: Db,
  id: string,
): Promise<InvoiceDetail | null> {
  const invoice = (
    await db.select().from(invoices).where(eq(invoices.id, id)).limit(1)
  )[0]
  if (!invoice) return null

  const [client, items] = await Promise.all([
    db
      .select({
        id: clients.id,
        name: clients.name,
        company: clients.company,
        archived: clients.archived,
      })
      .from(clients)
      .where(eq(clients.id, invoice.clientId))
      .limit(1),
    db
      .select({
        id: invoiceItems.id,
        description: invoiceItems.description,
        quantity: invoiceItems.quantity,
        unitPrice: invoiceItems.unitPrice,
        taxable: invoiceItems.taxable,
      })
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, id))
      .orderBy(asc(invoiceItems.sortOrder), asc(invoiceItems.id)),
  ])

  return {
    invoice,
    client: client[0],
    items,
    totals: computeInvoiceTotals(items, invoice.taxRateBps, invoice.discount),
  }
}

async function checkClient(db: Db, clientId: string, currentClientId?: string) {
  const client = (
    await db.select().from(clients).where(eq(clients.id, clientId)).limit(1)
  )[0]
  if (!client) return 'Choose an existing client.'
  if (client.archived && clientId !== currentClientId) {
    return 'Archived clients cannot be invoiced. Restore the client first.'
  }
  return null
}

export const isDuplicateNumber = (error: unknown) =>
  String((error as { cause?: unknown })?.cause ?? error).includes(
    'UNIQUE constraint failed: invoices.number',
  )

export async function createInvoice(
  db: Db,
  data: InvoiceData,
): Promise<SaveInvoiceResult> {
  const clientError = await checkClient(db, data.clientId)
  if (clientError) return { ok: false, error: clientError }
  if (!(await db.query.settings.findFirst())) {
    return {
      ok: false,
      error: 'Save your business details in settings before creating invoices.',
    }
  }

  const id = createId()
  // The number is read from the same row the last statement increments, in
  // one batch, so two saves can never receive the same number.
  const number = sql<string>`(select ${settings.invoicePrefix} || '-' || ${data.issueDate.slice(0, 4)} || '-' || printf('%04d', ${settings.nextInvoiceNumber}) from ${settings} where ${settings.id} = 'main')`
  const currency = sql<string>`(select ${settings.currency} from ${settings} where ${settings.id} = 'main')`

  try {
    await batch(db, [
      db.insert(invoices).values({
        id,
        number,
        clientId: data.clientId,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        currency,
        taxRateBps: data.taxRate,
        discount: data.discount,
      }),
      ...data.items.map((item, index) =>
        db.insert(invoiceItems).values({
          invoiceId: id,
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
    ])
  } catch (error) {
    if (isDuplicateNumber(error)) {
      return {
        ok: false,
        error:
          'That invoice number is already used. Raise the next invoice number in settings.',
      }
    }
    throw error
  }

  const created = await db
    .select({ number: invoices.number })
    .from(invoices)
    .where(eq(invoices.id, id))
  return { ok: true, id, number: created[0].number }
}

export async function updateInvoice(
  db: Db,
  id: string,
  data: InvoiceData,
): Promise<SaveInvoiceResult> {
  const existing = (
    await db.select().from(invoices).where(eq(invoices.id, id)).limit(1)
  )[0]
  if (!existing) return { ok: false, error: 'Invoice not found.' }
  if (existing.status !== 'draft') {
    return { ok: false, error: 'Only draft invoices can be edited.' }
  }
  const clientError = await checkClient(db, data.clientId, existing.clientId)
  if (clientError) return { ok: false, error: clientError }

  // Every statement re-checks the draft status so a status change between the
  // read above and the batch cannot leave a half-edited invoice.
  const stillDraft = sql`exists (select 1 from ${invoices} where ${invoices.id} = ${id} and ${invoices.status} = 'draft')`

  const [updated] = await batch(db, [
    db
      .update(invoices)
      .set({
        clientId: data.clientId,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        taxRateBps: data.taxRate,
        discount: data.discount,
      })
      .where(and(eq(invoices.id, id), eq(invoices.status, 'draft')))
      .returning({ id: invoices.id }),
    db
      .delete(invoiceItems)
      .where(and(eq(invoiceItems.invoiceId, id), stillDraft)),
    ...data.items.map((item, index) =>
      db
        .insert(invoiceItems)
        .select(
          sql`select ${createId()}, ${id}, ${item.description}, ${item.quantity}, ${item.unitPrice}, ${index}, ${item.taxable ? 1 : 0} where ${stillDraft}`,
        ),
    ),
  ])

  if ((updated as unknown[]).length === 0) {
    return { ok: false, error: 'Only draft invoices can be edited.' }
  }
  return { ok: true, id, number: existing.number }
}

export async function changeInvoiceStatus(
  db: Db,
  id: string,
  to: InvoiceStatus,
  token = createPublicToken(),
): Promise<ChangeStatusResult> {
  const existing = (
    await db.select().from(invoices).where(eq(invoices.id, id)).limit(1)
  )[0]
  if (!existing) return { ok: false, error: 'Invoice not found.' }
  if (!canTransition(existing.status, to)) {
    return {
      ok: false,
      error: `An invoice cannot move from ${existing.status} to ${to}.`,
    }
  }

  // The update matches on the status read above, so a concurrent change
  // makes this a no-op instead of an unchecked transition.
  const [updated] = await db
    .update(invoices)
    .set({
      status: to,
      ...(to === 'sent'
        ? {
            publicToken: sql`coalesce(${invoices.publicToken}, ${token})`,
            sentAt: sql`coalesce(${invoices.sentAt}, ${new Date().toISOString()})`,
          }
        : {}),
    })
    .where(and(eq(invoices.id, id), eq(invoices.status, existing.status)))
    .returning({ status: invoices.status, publicToken: invoices.publicToken })

  if (!updated) {
    return {
      ok: false,
      error: 'The invoice status changed meanwhile. Reload and try again.',
    }
  }
  return { ok: true, ...updated }
}

export async function getPublicInvoice(
  db: Db,
  token: string,
): Promise<PublicInvoice | null> {
  if (!isPublicToken(token)) return null

  const invoice = (
    await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.publicToken, token), ne(invoices.status, 'draft')))
      .limit(1)
  )[0]
  if (!invoice) return null

  const [client, business, items] = await Promise.all([
    db.select().from(clients).where(eq(clients.id, invoice.clientId)).limit(1),
    db.query.settings.findFirst(),
    db
      .select({
        id: invoiceItems.id,
        description: invoiceItems.description,
        quantity: invoiceItems.quantity,
        unitPrice: invoiceItems.unitPrice,
        taxable: invoiceItems.taxable,
      })
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, invoice.id))
      .orderBy(asc(invoiceItems.sortOrder), asc(invoiceItems.id)),
  ])

  return {
    invoice: {
      number: invoice.number,
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      taxRateBps: invoice.taxRateBps,
    },
    client: {
      name: client[0].name,
      company: client[0].company,
      email: client[0].email,
      address: client[0].address,
    },
    business: {
      name: business?.businessName ?? '',
      address: business?.address ?? '',
      email: business?.email ?? '',
      paymentInstructions: business?.paymentInstructions ?? '',
      bank: {
        name: business?.bankName ?? '',
        branch: business?.bankBranch ?? '',
        accountName: business?.bankAccountName ?? '',
        accountNumber: business?.bankAccountNumber ?? '',
        swiftCode: business?.bankSwiftCode ?? '',
      },
      hasLogo: Boolean(business?.logoKey),
    },
    items,
    totals: computeInvoiceTotals(items, invoice.taxRateBps, invoice.discount),
  }
}
