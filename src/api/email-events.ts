import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '#/db'
import { schema } from '#/db'
import type { EmailStatus } from '#/db/schema'

const eventStatuses = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
} as const satisfies Record<string, EmailStatus>

const eventSchema = z.object({
  type: z.string(),
  data: z.object({ email_id: z.string().min(1) }),
})

/**
 * A late `delivered` event must not hide an earlier bounce or complaint, so
 * `delivered` only applies to rows still in `sent`.
 */
const replaceableFrom = {
  delivered: ['sent'],
  bounced: ['sent', 'delivered'],
  complained: ['sent', 'delivered', 'bounced'],
} as const satisfies Record<string, EmailStatus[]>

export async function applyEmailEvent(
  db: Db,
  payload: unknown,
): Promise<'updated' | 'ignored'> {
  const parsed = eventSchema.safeParse(payload)
  if (!parsed.success) return 'ignored'
  const status = eventStatuses[parsed.data.type as keyof typeof eventStatuses]
  if (!status) return 'ignored'

  const { emailLog } = schema
  await db
    .update(emailLog)
    .set({ status })
    .where(
      and(
        eq(emailLog.providerId, parsed.data.data.email_id),
        inArray(emailLog.status, [...replaceableFrom[status]]),
      ),
    )
  return 'updated'
}
