import type {
  LeadCloseReason,
  LeadEventType,
  LeadPlatform,
  LeadStatus,
} from '#/db/schema'
import { leadCloseReasons } from '#/db/schema'

// Lead rules. Two pure functions own them:
// - `parseProfileUrl` turns a shared link, shared text or `@handle` into a
//   platform, a handle and a unique `profileKey`.
// - `nextLeadState` applies one action to a lead and returns the new status,
//   counters, next action date and the event to record. Server actions call it
//   and never set `status` or `next_action_on` themselves.
// Neither touches the database, the clock or the network.

export const DEFAULT_LEAD_TIME_ZONE = 'Asia/Colombo'

/** Leads that still need work. */
export const OPEN_LEAD_STATUSES = [
  'saved',
  'messaged',
  'seen',
  'replied',
] as const satisfies readonly LeadStatus[]

/** The follow-up limit does not apply to "not seen yet" checks. */
export const MAX_UNSEEN_CHECKS = 2

export const LEAD_PLATFORM_LABELS = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  x: 'X',
  whatsapp: 'WhatsApp',
  other: 'Other',
} as const satisfies Record<LeadPlatform, string>

export const LEAD_STATUS_LABELS = {
  saved: 'Saved',
  messaged: 'Messaged',
  seen: 'Seen',
  replied: 'Replied',
  won: 'Won',
  closed: 'Closed',
} as const satisfies Record<LeadStatus, string>

export const LEAD_CLOSE_REASON_LABELS = {
  no_reply: 'No reply',
  not_interested: 'Not interested',
  bad_fit: 'Bad fit',
  other: 'Other',
} as const satisfies Record<LeadCloseReason, string>

export const LEAD_EVENT_LABELS = {
  saved: 'Saved',
  messaged: 'Messaged',
  checked_unseen: 'Checked, not seen yet',
  checked_seen: 'Checked, seen with no reply',
  followed_up: 'Followed up',
  replied: 'They replied',
  rescheduled: 'Rescheduled',
  won: 'Won',
  closed: 'Closed',
  reopened: 'Reopened',
  note: 'Note',
} as const satisfies Record<LeadEventType, string>

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const isIsoDate = (value: string) => {
  if (!DATE_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

export const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The calendar date and hour (0 to 23) of `now` in `timeZone`. */
const localDateAndHour = (now: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
  }
}

/** Today's date in `timeZone`, as `YYYY-MM-DD`. */
export const localToday = (
  now: Date,
  timeZone: string = DEFAULT_LEAD_TIME_ZONE,
) => localDateAndHour(now, timeZone).date

/**
 * The first action date for a lead saved at `now`: today when it is saved
 * before 12:00 local time, tomorrow otherwise.
 */
export const defaultNextActionOn = (
  now: Date,
  timeZone: string = DEFAULT_LEAD_TIME_ZONE,
) => {
  const { date, hour } = localDateAndHour(now, timeZone)
  return hour < 12 ? date : addDays(date, 1)
}

// ---------------------------------------------------------------------------
// Profile URL parsing
// ---------------------------------------------------------------------------

export type ParsedProfile = {
  platform: LeadPlatform
  handle: string
  profileUrl: string
  profileKey: string
}

export type ParseProfileResult =
  ({ ok: true } & ParsedProfile) | { ok: false; error: string }

const fail = (error: string): { ok: false; error: string } => ({
  ok: false,
  error,
})

const ok = (
  platform: LeadPlatform,
  handle: string,
  profileUrl: string,
  key = handle,
): ParseProfileResult => ({
  ok: true,
  platform,
  handle,
  profileUrl,
  profileKey: `${platform}:${key}`,
})

const NOT_A_PROFILE = (platform: string) =>
  `That is not a ${platform} profile link. Open the profile and copy its link.`

const HOST_PLATFORMS: Record<string, LeadPlatform> = {
  'instagram.com': 'instagram',
  'instagr.am': 'instagram',
  'facebook.com': 'facebook',
  'fb.com': 'facebook',
  'tiktok.com': 'tiktok',
  'linkedin.com': 'linkedin',
  'x.com': 'x',
  'twitter.com': 'x',
  'wa.me': 'whatsapp',
  'api.whatsapp.com': 'whatsapp',
}

// Prefixes some apps put in front of the real host.
const HOST_PREFIXES = /^(www|m|mobile|web|l|lm)\./

const normalizeHost = (hostname: string) => {
  let host = hostname.toLowerCase()
  while (HOST_PREFIXES.test(host)) host = host.replace(HOST_PREFIXES, '')
  return host
}

const TRACKING_PARAMS = new Set([
  'igsh',
  'igshid',
  'si',
  'fbclid',
  'gclid',
  'ref',
  'ref_src',
  'ref_url',
  'mibextid',
  'feature',
  'trk',
  'rcm',
])

const isTrackingParam = (name: string) => {
  const lower = name.toLowerCase()
  return (
    lower.startsWith('utm_') ||
    lower.startsWith('mc_') ||
    TRACKING_PARAMS.has(lower)
  )
}

/** The first link in `text`, with or without a scheme. */
const findUrl = (text: string) => {
  const withScheme = text.match(/https?:\/\/[^\s<>"']+/i)
  const bare = text.match(
    /(?:^|[\s(])((?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?)/i,
  )
  const raw = withScheme?.[0] ?? (bare ? `https://${bare[1]}` : null)
  return raw ? raw.replace(/[.,;:!?)\]}]+$/, '') : null
}

const segmentsOf = (url: URL) =>
  url.pathname
    .split('/')
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s)
      } catch {
        return s
      }
    })

const INSTAGRAM_RESERVED = new Set([
  'p',
  'reel',
  'reels',
  'tv',
  'stories',
  'explore',
  'accounts',
  'direct',
  'share',
  'about',
  'developer',
  'legal',
])
const FACEBOOK_RESERVED = new Set([
  'share',
  'sharer',
  'sharer.php',
  'groups',
  'watch',
  'events',
  'marketplace',
  'photo',
  'photo.php',
  'permalink.php',
  'story.php',
  'login',
  'hashtag',
  'reel',
  'stories',
  'posts',
  'gaming',
  'help',
])
const X_RESERVED = new Set([
  'home',
  'i',
  'intent',
  'share',
  'search',
  'explore',
  'hashtag',
  'messages',
  'notifications',
  'settings',
  'login',
  'compose',
])

const HANDLE_RE = {
  instagram: /^[a-z0-9._]{1,30}$/,
  tiktok: /^[a-z0-9._]{1,24}$/,
  x: /^[a-z0-9_]{1,15}$/,
  facebook: /^[a-z0-9.-]{1,100}$/,
  linkedin: /^[a-z0-9_%-]{3,100}$/,
}

const whatsappNumber = (raw: string) => {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) {
    return fail('Enter a WhatsApp number with its country code.')
  }
  return ok('whatsapp', digits, `https://wa.me/${digits}`)
}

const parseKnown = (
  platform: LeadPlatform,
  url: URL,
  host: string,
): ParseProfileResult => {
  const segments = segmentsOf(url)
  const first = segments[0]?.toLowerCase()

  switch (platform) {
    case 'instagram': {
      if (!first || INSTAGRAM_RESERVED.has(first)) {
        return fail(NOT_A_PROFILE('Instagram'))
      }
      if (!HANDLE_RE.instagram.test(first)) {
        return fail(NOT_A_PROFILE('Instagram'))
      }
      return ok('instagram', first, `https://www.instagram.com/${first}/`)
    }
    case 'facebook': {
      if (first === 'profile.php') {
        const id = url.searchParams.get('id')
        if (id && /^\d{5,}$/.test(id)) {
          return ok(
            'facebook',
            id,
            `https://www.facebook.com/profile.php?id=${id}`,
          )
        }
        return fail(NOT_A_PROFILE('Facebook'))
      }
      if (first === 'people') {
        const id = segments.find((s) => /^\d{5,}$/.test(s))
        if (id) {
          return ok(
            'facebook',
            id,
            `https://www.facebook.com/profile.php?id=${id}`,
          )
        }
        return fail(NOT_A_PROFILE('Facebook'))
      }
      if (!first || FACEBOOK_RESERVED.has(first)) {
        return fail(NOT_A_PROFILE('Facebook'))
      }
      if (!HANDLE_RE.facebook.test(first)) {
        return fail(NOT_A_PROFILE('Facebook'))
      }
      return ok('facebook', first, `https://www.facebook.com/${first}`)
    }
    case 'tiktok': {
      if (!first?.startsWith('@')) return fail(NOT_A_PROFILE('TikTok'))
      const handle = first.slice(1)
      if (!HANDLE_RE.tiktok.test(handle)) {
        return fail(NOT_A_PROFILE('TikTok'))
      }
      return ok('tiktok', handle, `https://www.tiktok.com/@${handle}`)
    }
    case 'linkedin': {
      const slug = segments[1]?.toLowerCase()
      if (first !== 'in' || !slug || !HANDLE_RE.linkedin.test(slug)) {
        return fail(NOT_A_PROFILE('LinkedIn'))
      }
      return ok('linkedin', slug, `https://www.linkedin.com/in/${slug}/`)
    }
    case 'x': {
      if (!first || X_RESERVED.has(first) || !HANDLE_RE.x.test(first)) {
        return fail(NOT_A_PROFILE('X'))
      }
      return ok('x', first, `https://x.com/${first}`)
    }
    case 'whatsapp': {
      const raw =
        host === 'wa.me'
          ? (segments[0] ?? '')
          : (url.searchParams.get('phone') ?? '')
      return whatsappNumber(raw)
    }
    default:
      return fail(NOT_A_PROFILE('profile'))
  }
}

const parseOther = (url: URL, host: string): ParseProfileResult => {
  const kept = [...url.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name))
    .sort(([a], [b]) => a.localeCompare(b))
  const query = new URLSearchParams(kept).toString()
  const path = url.pathname.replace(/\/+$/, '')
  const display = `${host}${path}`
  const withQuery = query ? `${display}?${query}` : display
  return ok('other', display, `${url.protocol}//${withQuery}`, withQuery)
}

/**
 * Reads a profile link out of a URL, shared text that contains a URL, an
 * `@handle` (Instagram) or a phone number (WhatsApp). Strips tracking query
 * parameters, lowercases the host and handle, and maps `twitter.com` to
 * `x.com` and `fb.com` to `facebook.com`. Unknown hosts become `other`, keyed
 * by the cleaned URL.
 */
export const parseProfileUrl = (input: string): ParseProfileResult => {
  const text = input.trim()
  if (!text) return fail('Paste a profile link or an @handle.')

  const handleMatch = text.match(/^@([a-z0-9._]{1,30})$/i)
  if (handleMatch) {
    const handle = handleMatch[1].toLowerCase()
    return ok('instagram', handle, `https://www.instagram.com/${handle}/`)
  }

  if (/^\+?[\d\s\-()]{7,}$/.test(text)) {
    if (!text.startsWith('+') && /^\s*0/.test(text)) {
      return fail('Enter a WhatsApp number with its country code.')
    }
    return whatsappNumber(text)
  }

  const found = findUrl(text)
  if (!found) return fail('No link found. Paste a profile link or an @handle.')

  let url: URL
  try {
    url = new URL(found)
  } catch {
    return fail('That link is not valid.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return fail('That link is not valid.')
  }

  const host = normalizeHost(url.hostname)
  const platform = HOST_PLATFORMS[host]
  return platform ? parseKnown(platform, url, host) : parseOther(url, host)
}

// ---------------------------------------------------------------------------
// Message links
// ---------------------------------------------------------------------------

type MessageLinkLead = {
  platform: LeadPlatform
  handle: string
  profileUrl: string
}

/**
 * Link that opens a chat with the lead. Instagram, Facebook and WhatsApp have
 * a deep link. The rest open the profile. WhatsApp fills in `text`.
 */
export const messageLink = (lead: MessageLinkLead, text?: string) => {
  switch (lead.platform) {
    case 'instagram':
      return `https://ig.me/m/${lead.handle}`
    case 'facebook':
      return `https://m.me/${lead.handle}`
    case 'whatsapp':
      return text
        ? `https://wa.me/${lead.handle}?text=${encodeURIComponent(text)}`
        : `https://wa.me/${lead.handle}`
    default:
      return lead.profileUrl
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
//
//   saved -> messaged -> seen -> replied -> won
//   any open status -> closed, won or closed -> saved (reopen)
//
// See the lifecycle table in PLAN-leads.md for each action's counters and
// next action date.

/** The fields of a lead that the lifecycle reads and writes. */
export type LeadState = {
  status: LeadStatus
  nextActionOn: string | null
  followUps: number
  unseenChecks: number
  lastContactedAt: string | null
  closeReason: LeadCloseReason | null
}

export type LeadAction =
  | { type: 'save'; now: Date }
  | { type: 'mark_messaged'; now: Date }
  | { type: 'not_seen' }
  | { type: 'seen_no_reply' }
  | { type: 'mark_followed_up'; now: Date }
  | { type: 'replied' }
  | { type: 'won' }
  | { type: 'close'; reason: LeadCloseReason }
  | { type: 'reopen' }
  | { type: 'reschedule'; date: string }

export type LeadSettings = {
  leadMaxFollowUps: number
  timeZone?: string
}

export type LeadTransition =
  | {
      ok: true
      state: LeadState
      event: { type: LeadEventType; detail: string }
    }
  | { ok: false; error: string }

const isOpen = (status: LeadStatus) =>
  (OPEN_LEAD_STATUSES as readonly LeadStatus[]).includes(status)

/** True for the statuses that still need work. */
export const isOpenLead = isOpen

const invalid = (action: string, status: LeadStatus): LeadTransition => ({
  ok: false,
  error: `Cannot ${action} a lead that is ${status}.`,
})

/**
 * Applies `action` to `lead` (null for a new lead being saved) and returns the
 * new state and the event to record. An invalid transition returns an error
 * and nothing to write. `today` is the local date as `YYYY-MM-DD`.
 */
export const nextLeadState = (
  lead: LeadState | null,
  action: LeadAction,
  today: string,
  settings: LeadSettings,
): LeadTransition => {
  if (!isIsoDate(today))
    return { ok: false, error: 'Today is not a valid date.' }

  if (action.type === 'save') {
    if (lead) return { ok: false, error: 'This lead is already saved.' }
    return {
      ok: true,
      state: {
        status: 'saved',
        nextActionOn: defaultNextActionOn(action.now, settings.timeZone),
        followUps: 0,
        unseenChecks: 0,
        lastContactedAt: null,
        closeReason: null,
      },
      event: { type: 'saved', detail: '' },
    }
  }

  if (!lead) return { ok: false, error: 'Lead not found.' }
  const { status } = lead
  const next = (
    patch: Partial<LeadState>,
    type: LeadEventType,
    detail = '',
  ): LeadTransition => ({
    ok: true,
    state: { ...lead, ...patch },
    event: { type, detail },
  })

  switch (action.type) {
    case 'mark_messaged':
      if (status !== 'saved') return invalid('mark as messaged', status)
      return next(
        {
          status: 'messaged',
          lastContactedAt: action.now.toISOString(),
          nextActionOn: addDays(today, 2),
        },
        'messaged',
      )
    case 'not_seen':
      if (status !== 'messaged') return invalid('check as not seen', status)
      return next(
        {
          unseenChecks: lead.unseenChecks + 1,
          nextActionOn: addDays(today, 2),
        },
        'checked_unseen',
      )
    case 'seen_no_reply':
      if (status !== 'messaged') return invalid('mark as seen', status)
      return next(
        { status: 'seen', nextActionOn: addDays(today, 3) },
        'checked_seen',
      )
    case 'mark_followed_up':
      if (status !== 'seen') return invalid('mark as followed up', status)
      return next(
        {
          status: 'messaged',
          followUps: lead.followUps + 1,
          unseenChecks: 0,
          lastContactedAt: action.now.toISOString(),
          nextActionOn: addDays(today, 3),
        },
        'followed_up',
      )
    case 'replied':
      if (status !== 'messaged' && status !== 'seen') {
        return invalid('mark as replied', status)
      }
      return next(
        { status: 'replied', nextActionOn: addDays(today, 1) },
        'replied',
      )
    case 'won':
      if (status !== 'replied') return invalid('mark as won', status)
      return next({ status: 'won', nextActionOn: null }, 'won')
    case 'close':
      if (!isOpen(status)) return invalid('close', status)
      if (!(leadCloseReasons as readonly string[]).includes(action.reason)) {
        return { ok: false, error: 'Choose a reason for closing.' }
      }
      return next(
        {
          status: 'closed',
          closeReason: action.reason,
          nextActionOn: null,
        },
        'closed',
        action.reason,
      )
    case 'reopen':
      if (status !== 'won' && status !== 'closed') {
        return invalid('reopen', status)
      }
      return next(
        { status: 'saved', closeReason: null, nextActionOn: today },
        'reopened',
      )
    case 'reschedule':
      if (!isOpen(status)) return invalid('reschedule', status)
      if (!isIsoDate(action.date)) {
        return { ok: false, error: 'Choose a valid date.' }
      }
      return next({ nextActionOn: action.date }, 'rescheduled', action.date)
  }
}

/**
 * True when the lead has used up its follow-ups or unseen checks, so the card
 * offers "Close as no reply" as its main button.
 */
export const shouldOfferClose = (
  lead: Pick<LeadState, 'status' | 'followUps' | 'unseenChecks'>,
  settings: Pick<LeadSettings, 'leadMaxFollowUps'>,
) =>
  isOpen(lead.status) &&
  lead.status !== 'replied' &&
  (lead.followUps >= settings.leadMaxFollowUps ||
    lead.unseenChecks >= MAX_UNSEEN_CHECKS)

/**
 * The client form values to start from when a lead becomes a client. The note
 * records where the lead came from and keeps the lead's own note.
 */
export const leadClientPrefill = (lead: {
  platform: LeadPlatform
  handle: string
  profileUrl: string
  name: string
  note: string
}) => ({
  name: lead.name.trim() || lead.handle,
  company: '',
  email: '',
  address: '',
  notes: [
    `Lead from ${LEAD_PLATFORM_LABELS[lead.platform]}: ${lead.profileUrl}`,
    lead.note.trim(),
  ]
    .filter(Boolean)
    .join('\n\n'),
})
