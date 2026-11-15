import { eq, inArray } from 'drizzle-orm'
import type { Db } from '#/db'
import { schema } from '#/db'
import { groupTodayLeads } from '#/lib/lead-inputs'
import { localToday } from '#/lib/leads'
import { sendWebPush, type VapidKeys } from '#/lib/web-push'

const { leads, pushSubscriptions } = schema

export type LeadPushDeps = {
  /** Both must be set, or nothing is sent. */
  vapidPublicKey: string | undefined
  vapidPrivateKey: string | undefined
  origin: string
  fetcher?: typeof fetch
}

export type LeadPushResult = {
  sent: number
  failed: number
  /** Subscriptions deleted because the push service said they are gone. */
  removed: number
  skipped?: 'disabled' | 'not_configured' | 'nothing_due' | 'no_subscriptions'
}

/**
 * Sends the lead digest as a push notification to every subscribed device. It
 * follows the same rules as the email: the switch must be on and a lead must be
 * due. Each device gets at most one push per day in the lead time zone.
 * Devices the push service reports as gone are deleted.
 */
export async function sendLeadPush(
  db: Db,
  deps: LeadPushDeps,
  now: Date,
): Promise<LeadPushResult> {
  const none = { sent: 0, failed: 0, removed: 0 }
  const settings = await db.query.settings.findFirst()
  if (!settings?.sendLeadDigest) return { ...none, skipped: 'disabled' }
  if (!deps.vapidPublicKey || !deps.vapidPrivateKey) {
    return { ...none, skipped: 'not_configured' }
  }

  const today = localToday(now)
  const groups = groupTodayLeads(await db.select().from(leads), today).filter(
    (group) => group.leads.length > 0,
  )
  const total = groups.reduce((sum, group) => sum + group.leads.length, 0)
  if (total === 0) return { ...none, skipped: 'nothing_due' }

  const devices = (await db.select().from(pushSubscriptions)).filter(
    (device) => device.lastPushedOn !== today,
  )
  if (devices.length === 0) return { ...none, skipped: 'no_subscriptions' }

  const title = `${total} ${total === 1 ? 'lead' : 'leads'} due today`
  const body = groups
    .map((group) => `${group.title}: ${group.leads.length}`)
    .join(', ')
  const message = { title, body, url: '/admin/leads' }
  const vapid: VapidKeys = {
    publicKey: deps.vapidPublicKey,
    privateKey: deps.vapidPrivateKey,
  }

  let sent = 0
  let failed = 0
  const gone: string[] = []
  for (const device of devices) {
    const result = await sendWebPush(device, message, {
      vapid,
      subject: deps.origin,
      fetcher: deps.fetcher,
      now,
    })
    if (result.ok) {
      sent++
      await db
        .update(pushSubscriptions)
        .set({ lastPushedOn: today })
        .where(eq(pushSubscriptions.id, device.id))
    } else {
      failed++
      console.error(`lead push failed: ${result.error}`)
      if (result.gone) gone.push(device.id)
    }
  }
  if (gone.length > 0) {
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.id, gone))
  }
  return { sent, failed, removed: gone.length }
}
