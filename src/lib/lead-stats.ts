import type { LeadPlatform } from '#/db/schema'
import { leadPlatforms } from '#/db/schema'

export const LEAD_STATS_PERIODS = [30, 90, 365] as const
export type LeadStatsPeriod = (typeof LEAD_STATS_PERIODS)[number]

/** One `lead_events` row joined with its lead's platform. */
export type LeadStatsEvent = {
  leadId: string
  platform: LeadPlatform
  type: string
  detail: string
  createdAt: string
}

export type PlatformStats = {
  platform: LeadPlatform
  saved: number
  messaged: number
  replied: number
  won: number
  closedNoReply: number
  /** Replied divided by messaged, or null when nothing was messaged. */
  replyRate: number | null
  /** Won divided by messaged, or null when nothing was messaged. */
  winRate: number | null
}

const rate = (part: number, whole: number) => (whole > 0 ? part / whole : null)

/**
 * Counts each step per platform from the events logged since `now - days`.
 * A lead counts once per step, however many times it repeated that step, so a
 * reopened lead still counts for its earlier steps and is not counted twice.
 * Platforms with no events are left out.
 */
export function computeLeadStats(
  events: readonly LeadStatsEvent[],
  now: Date,
  days: number,
): PlatformStats[] {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString()
  const seen = new Map<string, Set<string>>()
  const add = (platform: LeadPlatform, step: string, leadId: string) => {
    const key = `${platform}:${step}`
    const set = seen.get(key) ?? new Set<string>()
    set.add(leadId)
    seen.set(key, set)
  }

  for (const event of events) {
    if (event.createdAt < since || event.createdAt > now.toISOString()) continue
    const { platform, leadId } = event
    switch (event.type) {
      case 'saved':
      case 'messaged':
      case 'replied':
      case 'won':
        add(platform, event.type, leadId)
        break
      case 'closed':
        if (event.detail === 'no_reply') add(platform, 'closedNoReply', leadId)
        break
    }
  }

  const count = (platform: LeadPlatform, step: string) =>
    seen.get(`${platform}:${step}`)?.size ?? 0

  return leadPlatforms
    .map((platform) => {
      const messaged = count(platform, 'messaged')
      const replied = count(platform, 'replied')
      const won = count(platform, 'won')
      return {
        platform,
        saved: count(platform, 'saved'),
        messaged,
        replied,
        won,
        closedNoReply: count(platform, 'closedNoReply'),
        replyRate: rate(replied, messaged),
        winRate: rate(won, messaged),
      }
    })
    .filter(
      (row) =>
        row.saved + row.messaged + row.replied + row.won + row.closedNoReply >
        0,
    )
}
