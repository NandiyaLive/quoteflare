import { and, asc, desc, eq, gte } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Db } from '#/db'
import { schema } from '#/db'
import { createId } from '#/lib/id'
import { computeLeadStats } from '#/lib/lead-stats'
import type {
  LeadActionInput,
  LeadClientInput,
  LeadDetailsValues,
} from '#/lib/lead-inputs'
import {
  localToday,
  nextLeadState,
  parseProfileUrl,
  type LeadAction,
  type LeadSettings,
  type LeadState,
} from '#/lib/leads'

const { leads, leadEvents, settings, clients, quotes } = schema

export type LeadRow = typeof leads.$inferSelect
export type LeadEventRow = typeof leadEvents.$inferSelect

export type LeadResult =
  { ok: true; id: string; existing: boolean } | { ok: false; error: string }

const DEFAULT_MAX_FOLLOW_UPS = 2

export async function loadLeadSettings(db: Db): Promise<LeadSettings> {
  const row = await db
    .select({ leadMaxFollowUps: settings.leadMaxFollowUps })
    .from(settings)
    .limit(1)
  return {
    leadMaxFollowUps: row[0]?.leadMaxFollowUps ?? DEFAULT_MAX_FOLLOW_UPS,
  }
}

/** The saved message templates. Empty strings mean none is set. */
export async function loadLeadTemplates(db: Db) {
  const row = (
    await db
      .select({
        opener: settings.leadOpenerTemplate,
        followUp: settings.leadFollowUpTemplate,
      })
      .from(settings)
      .limit(1)
  )[0]
  return { opener: row?.opener ?? '', followUp: row?.followUp ?? '' }
}

/** Every lead, with the settings and today's date the pages need to group them. */
export async function loadLeads(db: Db, now: Date) {
  const [rows, leadSettings] = await Promise.all([
    db
      .select()
      .from(leads)
      .orderBy(asc(leads.nextActionOn), desc(leads.createdAt), asc(leads.id)),
    loadLeadSettings(db),
  ])
  return {
    leads: rows,
    today: localToday(now, leadSettings.timeZone),
    maxFollowUps: leadSettings.leadMaxFollowUps,
    templates: await loadLeadTemplates(db),
  }
}

/** Per-platform step counts for the last `days` days, taken from `lead_events`. */
export async function loadLeadStats(db: Db, days: number, now: Date) {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString()
  const events = await db
    .select({
      leadId: leadEvents.leadId,
      platform: leads.platform,
      type: leadEvents.type,
      detail: leadEvents.detail,
      createdAt: leadEvents.createdAt,
    })
    .from(leadEvents)
    .innerJoin(leads, eq(leads.id, leadEvents.leadId))
    .where(gte(leadEvents.createdAt, since))
  return computeLeadStats(events, now, days)
}

export async function loadLeadDetail(db: Db, id: string, now: Date) {
  const lead = (
    await db.select().from(leads).where(eq(leads.id, id)).limit(1)
  )[0]
  if (!lead) return null
  const [events, leadSettings, client, quote] = await Promise.all([
    db
      .select()
      .from(leadEvents)
      .where(eq(leadEvents.leadId, id))
      .orderBy(desc(leadEvents.createdAt), desc(leadEvents.id)),
    loadLeadSettings(db),
    lead.clientId
      ? db
          .select({
            id: clients.id,
            name: clients.name,
            archived: clients.archived,
          })
          .from(clients)
          .where(eq(clients.id, lead.clientId))
          .limit(1)
      : [],
    lead.quoteId
      ? db
          .select({ id: quotes.id, number: quotes.number })
          .from(quotes)
          .where(eq(quotes.id, lead.quoteId))
          .limit(1)
      : [],
  ])
  return {
    lead,
    client: client[0] ?? null,
    quote: quote[0] ?? null,
    events,
    today: localToday(now, leadSettings.timeZone),
    maxFollowUps: leadSettings.leadMaxFollowUps,
  }
}

const batch = (db: Db, statements: BatchItem<'sqlite'>[]) =>
  db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

const toState = (lead: LeadRow): LeadState => ({
  status: lead.status,
  nextActionOn: lead.nextActionOn,
  followUps: lead.followUps,
  unseenChecks: lead.unseenChecks,
  lastContactedAt: lead.lastContactedAt,
  closeReason: lead.closeReason,
})

/** Returns the ID of the saved lead for a link, or null when there is none. */
export async function findLeadByInput(
  db: Db,
  input: string,
): Promise<string | null> {
  const parsed = parseProfileUrl(input)
  if (!parsed.ok) return null
  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.profileKey, parsed.profileKey))
    .limit(1)
  return rows[0]?.id ?? null
}

/**
 * Saves a profile from a pasted link, shared text or `@handle`. A profile that
 * is already saved returns the existing lead's ID instead of an error.
 */
export async function saveLead(
  db: Db,
  input: string,
  now: Date,
  extra: { name?: string; note?: string } = {},
): Promise<LeadResult> {
  const parsed = parseProfileUrl(input)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const existing = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.profileKey, parsed.profileKey))
    .limit(1)
  if (existing[0]) return { ok: true, id: existing[0].id, existing: true }

  const leadSettings = await loadLeadSettings(db)
  const today = localToday(now, leadSettings.timeZone)
  const result = nextLeadState(null, { type: 'save', now }, today, leadSettings)
  if (!result.ok) return { ok: false, error: result.error }

  const id = createId()
  const stamp = now.toISOString()
  try {
    await batch(db, [
      db.insert(leads).values({
        id,
        platform: parsed.platform,
        handle: parsed.handle,
        profileUrl: parsed.profileUrl,
        profileKey: parsed.profileKey,
        name: extra.name ?? '',
        note: extra.note ?? '',
        ...result.state,
        createdAt: stamp,
      }),
      db.insert(leadEvents).values({
        id: createId(),
        leadId: id,
        type: result.event.type,
        detail: result.event.detail,
        createdAt: stamp,
      }),
    ])
  } catch (error) {
    // A second save of the same profile can win the race for the unique key.
    const again = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.profileKey, parsed.profileKey))
      .limit(1)
    if (again[0]) return { ok: true, id: again[0].id, existing: true }
    throw error
  }
  return { ok: true, id, existing: false }
}

const toLifecycleAction = (input: LeadActionInput, now: Date): LeadAction => {
  switch (input.type) {
    case 'mark_messaged':
    case 'mark_followed_up':
      return { type: input.type, now }
    case 'close':
      return { type: 'close', reason: input.reason }
    case 'reschedule':
      return { type: 'reschedule', date: input.date }
    default:
      return { type: input.type }
  }
}

/**
 * Applies one lifecycle action. The lifecycle function decides the new state
 * and the event. This function loads the lead, then writes the lead and its
 * event in one batch.
 */
export async function applyLeadAction(
  db: Db,
  input: LeadActionInput,
  now: Date,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const lead = (
    await db.select().from(leads).where(eq(leads.id, input.id)).limit(1)
  )[0]
  if (!lead) return { ok: false, error: 'Lead not found.' }

  const leadSettings = await loadLeadSettings(db)
  const today = localToday(now, leadSettings.timeZone)
  const result = nextLeadState(
    toState(lead),
    toLifecycleAction(input, now),
    today,
    leadSettings,
  )
  if (!result.ok) return { ok: false, error: result.error }

  const { state } = result
  await batch(db, [
    db
      .update(leads)
      .set({
        status: state.status,
        nextActionOn: state.nextActionOn,
        followUps: state.followUps,
        unseenChecks: state.unseenChecks,
        lastContactedAt: state.lastContactedAt,
        closeReason: state.closeReason,
      })
      .where(eq(leads.id, lead.id)),
    db.insert(leadEvents).values({
      id: createId(),
      leadId: lead.id,
      type: result.event.type,
      detail: result.event.detail,
      createdAt: now.toISOString(),
    }),
  ])
  return { ok: true }
}

/** Edits the name and note. These are not lifecycle fields. */
export async function updateLeadDetails(
  db: Db,
  values: LeadDetailsValues,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const updated = await db
    .update(leads)
    .set({ name: values.name, note: values.note })
    .where(eq(leads.id, values.id))
    .returning({ id: leads.id })
  return updated.length > 0
    ? { ok: true }
    : { ok: false, error: 'Lead not found.' }
}

/**
 * Creates a client from a `replied` lead and links it to the lead. The client
 * and the link are written in one batch. A lead keeps one client.
 */
export async function makeClientFromLead(
  db: Db,
  input: LeadClientInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const lead = (
    await db.select().from(leads).where(eq(leads.id, input.leadId)).limit(1)
  )[0]
  if (!lead) return { ok: false, error: 'Lead not found.' }
  if (lead.status !== 'replied') {
    return { ok: false, error: 'Only a lead that replied can become a client.' }
  }
  if (lead.clientId) return { ok: false, error: 'This lead has a client.' }

  const clientId = createId()
  await batch(db, [
    db.insert(clients).values({ id: clientId, ...input.client }),
    db
      .update(leads)
      .set({ clientId })
      .where(and(eq(leads.id, lead.id), eq(leads.status, 'replied'))),
  ])
  return { ok: true, id: clientId }
}

/**
 * Checks that a lead can be won by a new quote and returns a function that
 * builds the statements for that quote's batch. `nextLeadState` decides the
 * new state, so the lead must be `replied` and have a client and no quote.
 */
export async function planLeadWin(
  db: Db,
  leadId: string,
  now: Date,
): Promise<
  | { ok: true; statements: (quoteId: string) => BatchItem<'sqlite'>[] }
  | { ok: false; error: string }
> {
  const lead = (
    await db.select().from(leads).where(eq(leads.id, leadId)).limit(1)
  )[0]
  if (!lead) return { ok: false, error: 'Lead not found.' }
  if (!lead.clientId) {
    return { ok: false, error: 'Make this lead a client before a quote.' }
  }
  if (lead.quoteId) return { ok: false, error: 'This lead has a quote.' }

  const leadSettings = await loadLeadSettings(db)
  const today = localToday(now, leadSettings.timeZone)
  const result = nextLeadState(
    toState(lead),
    { type: 'won' },
    today,
    leadSettings,
  )
  if (!result.ok) return { ok: false, error: result.error }

  const { state } = result
  return {
    ok: true,
    statements: (quoteId) => [
      db
        .update(leads)
        .set({
          quoteId,
          status: state.status,
          nextActionOn: state.nextActionOn,
        })
        .where(and(eq(leads.id, lead.id), eq(leads.status, lead.status))),
      db.insert(leadEvents).values({
        id: createId(),
        leadId: lead.id,
        type: result.event.type,
        detail: result.event.detail,
        createdAt: now.toISOString(),
      }),
    ],
  }
}
