import { asc, eq } from 'drizzle-orm'
import type { Db } from '#/db'
import { schema } from '#/db'
import type { RecurringItem } from '#/db/schema'
import { minorToDecimal } from '#/lib/decimal'
import { createId } from '#/lib/id'
import { computeInvoiceTotals } from '#/lib/invoices'
import type { RecurringData, RecurringFormValues } from '#/lib/recurring'

const { recurringSchedules, clients } = schema

export type RecurringRow = {
  id: string
  clientId: string
  clientName: string
  clientCompany: string
  interval: (typeof recurringSchedules.$inferSelect)['interval']
  nextRunDate: string
  autoSend: boolean
  active: boolean
  items: RecurringItem[]
  total: number
  currency: string
}

export type SaveRecurringResult =
  { ok: true; id: string } | { ok: false; error: string }

export async function listSchedules(db: Db): Promise<RecurringRow[]> {
  const [rows, settings] = await Promise.all([
    db
      .select({
        id: recurringSchedules.id,
        clientId: recurringSchedules.clientId,
        clientName: clients.name,
        clientCompany: clients.company,
        interval: recurringSchedules.interval,
        nextRunDate: recurringSchedules.nextRunDate,
        autoSend: recurringSchedules.autoSend,
        active: recurringSchedules.active,
        items: recurringSchedules.items,
      })
      .from(recurringSchedules)
      .innerJoin(clients, eq(clients.id, recurringSchedules.clientId))
      .orderBy(asc(recurringSchedules.nextRunDate), asc(recurringSchedules.id)),
    db.query.settings.findFirst(),
  ])
  return rows.map((row) => ({
    ...row,
    total: computeInvoiceTotals(row.items, settings?.taxRateBps ?? 0, 0).total,
    currency: settings?.currency ?? 'LKR',
  }))
}

export async function getSchedule(
  db: Db,
  id: string,
): Promise<RecurringFormValues | null> {
  const row = (
    await db
      .select()
      .from(recurringSchedules)
      .where(eq(recurringSchedules.id, id))
      .limit(1)
  )[0]
  if (!row) return null
  return {
    id: row.id,
    clientId: row.clientId,
    interval: row.interval,
    nextRunDate: row.nextRunDate,
    autoSend: row.autoSend,
    items: row.items.map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: minorToDecimal(item.unitPrice),
      taxable: item.taxable ?? true,
    })),
  }
}

export async function saveSchedule(
  db: Db,
  data: RecurringData,
): Promise<SaveRecurringResult> {
  const client = (
    await db
      .select()
      .from(clients)
      .where(eq(clients.id, data.clientId))
      .limit(1)
  )[0]
  if (!client) return { ok: false, error: 'Choose an existing client.' }

  const existing = data.id
    ? (
        await db
          .select({ clientId: recurringSchedules.clientId })
          .from(recurringSchedules)
          .where(eq(recurringSchedules.id, data.id))
          .limit(1)
      )[0]
    : null
  if (data.id && !existing) return { ok: false, error: 'Schedule not found.' }
  if (client.archived && client.id !== existing?.clientId) {
    return {
      ok: false,
      error: 'Archived clients cannot be invoiced. Restore the client first.',
    }
  }

  const columns = {
    clientId: data.clientId,
    interval: data.interval,
    nextRunDate: data.nextRunDate,
    autoSend: data.autoSend,
    items: data.items.map((item): RecurringItem => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxable: item.taxable,
    })),
  }

  if (data.id) {
    await db
      .update(recurringSchedules)
      .set(columns)
      .where(eq(recurringSchedules.id, data.id))
    return { ok: true, id: data.id }
  }
  const id = createId()
  await db.insert(recurringSchedules).values({ id, ...columns })
  return { ok: true, id }
}

export async function setScheduleActive(
  db: Db,
  id: string,
  active: boolean,
): Promise<boolean> {
  const updated = await db
    .update(recurringSchedules)
    .set({ active })
    .where(eq(recurringSchedules.id, id))
    .returning({ id: recurringSchedules.id })
  return updated.length > 0
}
