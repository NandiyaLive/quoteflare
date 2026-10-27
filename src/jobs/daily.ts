import { and, eq, lt } from 'drizzle-orm'
import { createDb, schema, type Db } from '#/db'

export interface DailyJobResult {
  markedOverdue: number
}

export async function markOverdueInvoices(
  db: Db,
  today: string,
): Promise<number> {
  const rows = await db
    .update(schema.invoices)
    .set({ status: 'overdue' })
    .where(
      and(
        eq(schema.invoices.status, 'sent'),
        lt(schema.invoices.dueDate, today),
      ),
    )
    .returning({ id: schema.invoices.id })
  return rows.length
}

export async function runDailyJobs(
  env: Pick<Env, 'DB'>,
  now: Date = new Date(),
): Promise<DailyJobResult> {
  const db = createDb(env.DB)
  const today = now.toISOString().slice(0, 10)

  const markedOverdue = await markOverdueInvoices(db, today)
  console.log(`daily: marked ${markedOverdue} invoices overdue`)

  return { markedOverdue }
}
