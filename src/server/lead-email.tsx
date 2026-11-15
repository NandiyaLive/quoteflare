import { and, desc, eq, ne } from 'drizzle-orm'
import { render } from '@react-email/render'
import type { Db } from '#/db'
import { schema } from '#/db'
import { LeadDigestEmail } from '#/emails/lead-digest-email'
import { createId } from '#/lib/id'
import { groupTodayLeads } from '#/lib/lead-inputs'
import { localToday } from '#/lib/leads'
import { sendEmail } from './email'

const { emailLog, leads } = schema

export const MAX_DIGEST_HANDLES = 10

export type LeadDigestDeps = {
  apiKey: string | undefined
  from: string
  origin: string
  fetcher?: typeof fetch
}

export type LeadDigestResult =
  | { sent: true }
  | {
      sent: false
      reason:
        'disabled' | 'no_email' | 'nothing_due' | 'already_sent' | 'failed'
    }

/**
 * Emails one summary of the leads due today: counts per Today group, up to ten
 * handles each, and a link to the leads page. It sends nothing when the switch
 * is off, when no lead is due, or when a digest that did not fail was already
 * logged for today's date in the lead time zone.
 */
export async function sendLeadDigest(
  db: Db,
  deps: LeadDigestDeps,
  now: Date,
): Promise<LeadDigestResult> {
  const settings = await db.query.settings.findFirst()
  if (!settings?.sendLeadDigest) return { sent: false, reason: 'disabled' }
  const to = settings.email.trim()
  if (!to) return { sent: false, reason: 'no_email' }

  const today = localToday(now)
  const groups = groupTodayLeads(await db.select().from(leads), today).filter(
    (group) => group.leads.length > 0,
  )
  const total = groups.reduce((sum, group) => sum + group.leads.length, 0)
  if (total === 0) return { sent: false, reason: 'nothing_due' }

  const last = (
    await db
      .select({ createdAt: emailLog.createdAt })
      .from(emailLog)
      .where(
        and(eq(emailLog.type, 'lead_digest'), ne(emailLog.status, 'failed')),
      )
      .orderBy(desc(emailLog.createdAt))
      .limit(1)
  )[0]
  if (last && localToday(new Date(last.createdAt)) === today) {
    return { sent: false, reason: 'already_sent' }
  }

  const heading = `${total} ${total === 1 ? 'lead' : 'leads'} due today`
  const element = (
    <LeadDigestEmail
      businessName={settings.businessName}
      heading={heading}
      groups={groups.map((group) => ({
        title: group.title,
        count: group.leads.length,
        handles: group.leads.slice(0, MAX_DIGEST_HANDLES).map((l) => l.handle),
      }))}
      url={`${deps.origin}/admin/leads`}
      preview={heading}
    />
  )
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ])

  const logId = createId()
  await db.insert(emailLog).values({
    id: logId,
    type: 'lead_digest',
    toAddress: to,
    status: 'pending',
    createdAt: now.toISOString(),
  })
  const sent = await sendEmail(
    deps.apiKey,
    { from: deps.from, to, subject: heading, text, html },
    logId,
    deps.fetcher,
  )
  await db
    .update(emailLog)
    .set(
      sent.ok
        ? { status: 'sent', providerId: sent.id }
        : { status: 'failed', error: sent.error },
    )
    .where(eq(emailLog.id, logId))
  return sent.ok ? { sent: true } : { sent: false, reason: 'failed' }
}
