import { and, asc, desc, eq, or, sql } from 'drizzle-orm'
import type { Db } from '#/db'
import { schema } from '#/db'
import type { ClientFilter, ClientFormValues } from '#/lib/clients'
import { createId } from '#/lib/id'

const { clients, invoices } = schema

const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')

export async function listClients(db: Db, filter: ClientFilter) {
  const term = `%${escapeLike(filter.q)}%`
  const search = filter.q
    ? or(
        sql`${clients.name} like ${term} escape '\\'`,
        sql`${clients.company} like ${term} escape '\\'`,
      )
    : undefined
  const status =
    filter.status === 'all'
      ? undefined
      : eq(clients.archived, filter.status === 'archived')
  return db
    .select()
    .from(clients)
    .where(and(search, status))
    .orderBy(asc(sql`lower(${clients.name})`), asc(clients.id))
}

export type ClientRow = Awaited<ReturnType<typeof listClients>>[number]

/** Active clients only, for the picker on invoices. */
export function listActiveClients(db: Db) {
  return listClients(db, { q: '', status: 'active' })
}

export async function getClient(db: Db, id: string) {
  return (await db.select().from(clients).where(eq(clients.id, id)).limit(1))[0]
}

export async function listClientInvoices(db: Db, clientId: string) {
  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      currency: invoices.currency,
    })
    .from(invoices)
    .where(eq(invoices.clientId, clientId))
    .orderBy(desc(invoices.issueDate), desc(invoices.number))
}

export type ClientInvoiceRow = Awaited<
  ReturnType<typeof listClientInvoices>
>[number]

export async function saveClient(
  db: Db,
  values: ClientFormValues,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { id, ...fields } = values
  if (!id) {
    const created = createId()
    await db.insert(clients).values({ id: created, ...fields })
    return { ok: true, id: created }
  }
  const updated = await db
    .update(clients)
    .set(fields)
    .where(eq(clients.id, id))
    .returning({ id: clients.id })
  if (updated.length === 0) return { ok: false, error: 'Client not found.' }
  return { ok: true, id }
}

export async function setClientArchived(
  db: Db,
  id: string,
  archived: boolean,
): Promise<boolean> {
  const updated = await db
    .update(clients)
    .set({ archived })
    .where(eq(clients.id, id))
    .returning({ id: clients.id })
  return updated.length > 0
}
