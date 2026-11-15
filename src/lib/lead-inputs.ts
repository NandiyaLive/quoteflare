import { z } from 'zod'
import { leadCloseReasons } from '#/db/schema'
import type { LeadStatus } from '#/db/schema'
import { isIsoDate, OPEN_LEAD_STATUSES } from '#/lib/leads'

export const leadLinkSchema = z.strictObject({
  input: z
    .string()
    .trim()
    .min(1, 'Paste a profile link or an @handle')
    .max(2000),
})

export const leadDetailsSchema = z.strictObject({
  id: z.string().min(1).max(64),
  name: z.string().trim().max(120, 'Name must be 120 characters or fewer'),
  note: z.string().trim().max(5000, 'Note must be 5000 characters or fewer'),
})

export type LeadDetailsValues = z.infer<typeof leadDetailsSchema>

const leadId = z.string().min(1).max(64)

/** Every action a server call may apply. `save` is separate and `now` is set on the server. */
export const leadActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('mark_messaged'), id: leadId }),
  z.strictObject({ type: z.literal('not_seen'), id: leadId }),
  z.strictObject({ type: z.literal('seen_no_reply'), id: leadId }),
  z.strictObject({ type: z.literal('mark_followed_up'), id: leadId }),
  z.strictObject({ type: z.literal('replied'), id: leadId }),
  z.strictObject({ type: z.literal('won'), id: leadId }),
  z.strictObject({
    type: z.literal('close'),
    id: leadId,
    reason: z.enum(leadCloseReasons),
  }),
  z.strictObject({ type: z.literal('reopen'), id: leadId }),
  z.strictObject({
    type: z.literal('reschedule'),
    id: leadId,
    date: z.string().refine(isIsoDate, 'Choose a valid date'),
  }),
])

export type LeadActionInput = z.infer<typeof leadActionSchema>

// ---------------------------------------------------------------------------
// Today groups
// ---------------------------------------------------------------------------

export const TODAY_GROUPS = [
  {
    id: 'first_message',
    title: 'Send first message',
    status: 'saved',
    empty: 'No first messages due.',
  },
  {
    id: 'check_seen',
    title: 'Check if they saw it',
    status: 'messaged',
    empty: 'Nothing to check.',
  },
  {
    id: 'follow_up',
    title: 'Follow up',
    status: 'seen',
    empty: 'No follow-ups due.',
  },
  {
    id: 'in_conversation',
    title: 'In conversation',
    status: 'replied',
    empty: 'No conversations waiting.',
  },
] as const satisfies readonly {
  id: string
  title: string
  status: LeadStatus
  empty: string
}[]

export type TodayGroupId = (typeof TODAY_GROUPS)[number]['id']

type DueLead = { status: LeadStatus; nextActionOn: string | null }

/** An open lead whose next action date is today or earlier. */
export const isDue = (lead: DueLead, today: string) =>
  (OPEN_LEAD_STATUSES as readonly LeadStatus[]).includes(lead.status) &&
  lead.nextActionOn !== null &&
  lead.nextActionOn <= today

export const isOverdue = (lead: DueLead, today: string) =>
  isDue(lead, today) && (lead.nextActionOn as string) < today

/**
 * Splits the due leads into the four Today groups. Within a group the most
 * overdue lead comes first.
 */
export function groupTodayLeads<T extends DueLead & { id: string }>(
  leads: readonly T[],
  today: string,
) {
  const due = leads
    .filter((lead) => isDue(lead, today))
    .sort(
      (a, b) =>
        (a.nextActionOn as string).localeCompare(b.nextActionOn as string) ||
        a.id.localeCompare(b.id),
    )
  return TODAY_GROUPS.map((group) => ({
    ...group,
    leads: due.filter((lead) => lead.status === group.status),
  }))
}

/** Whole days from `from` (an ISO date or timestamp) to the date `today`. */
export const daysSince = (from: string, today: string) => {
  const start = Date.parse(`${from.slice(0, 10)}T00:00:00Z`)
  const end = Date.parse(`${today}T00:00:00Z`)
  return Math.max(0, Math.round((end - start) / 86_400_000))
}

// ---------------------------------------------------------------------------
// Step buttons
// ---------------------------------------------------------------------------

export type StepAction = {
  type: Exclude<LeadActionInput['type'], 'close' | 'reschedule' | 'reopen'>
  label: string
}

/** The lifecycle buttons for each status, main button first. Close, Reschedule and Reopen are added by the pages. */
export const STEP_ACTIONS: Record<LeadStatus, readonly StepAction[]> = {
  saved: [{ type: 'mark_messaged', label: 'Mark messaged' }],
  messaged: [
    { type: 'not_seen', label: 'Not seen yet' },
    { type: 'seen_no_reply', label: 'Seen, no reply' },
    { type: 'replied', label: 'They replied' },
  ],
  seen: [
    { type: 'mark_followed_up', label: 'Mark followed up' },
    { type: 'replied', label: 'They replied' },
  ],
  replied: [{ type: 'won', label: 'Won' }],
  won: [],
  closed: [],
}
