import { and, eq, lt } from 'drizzle-orm'
import { createDb, schema, type Db } from '#/db'
import { sendDueReminders } from './reminders'
import { runRecurringSchedules } from './recurring'

export type DailyEnv = Pick<Env, 'DB' | 'RESEND_API_KEY' | 'EMAIL_FROM'> & {
  APP_ORIGIN: string
}

export interface DailyJobResult {
  markedOverdue: number
  remindersSent: number
  remindersFailed: number
  recurringCreated: number
  recurringSent: number
  recurringFailed: number
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
  env: DailyEnv,
  now: Date = new Date(),
  fetcher?: typeof fetch,
): Promise<DailyJobResult> {
  const db = createDb(env.DB)
  const today = now.toISOString().slice(0, 10)

  const markedOverdue = await markOverdueInvoices(db, today)
  console.log(`daily: marked ${markedOverdue} invoices overdue`)

  const reminders = await sendDueReminders(
    db,
    {
      apiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM,
      origin: env.APP_ORIGIN,
      fetcher,
    },
    now,
  )
  console.log(
    `daily: sent ${reminders.sent} reminders, ${reminders.failed} failed`,
  )

  const recurring = await runRecurringSchedules(
    db,
    {
      apiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM,
      origin: env.APP_ORIGIN,
      fetcher,
    },
    now,
  )
  console.log(
    `daily: created ${recurring.created} recurring invoices, sent ${recurring.sent}, ${recurring.failed} failed`,
  )

  return {
    markedOverdue,
    remindersSent: reminders.sent,
    remindersFailed: reminders.failed,
    recurringCreated: recurring.created,
    recurringSent: recurring.sent,
    recurringFailed: recurring.failed,
  }
}
