import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb, schema, type Db } from '#/db'
import { createTestD1 } from '#/db/test-db'
import { isCuid } from '#/lib/id'
import {
  groupTodayLeads,
  isOverdue,
  leadActionSchema,
  leadDetailsSchema,
} from '#/lib/lead-inputs'
import {
  applyLeadAction,
  loadLeadDetail,
  loadLeads,
  saveLead,
  updateLeadDetails,
} from './leads'

let db: Db
let dispose: () => Promise<void>

beforeAll(async () => {
  const test = await createTestD1()
  db = createDb(test.d1)
  dispose = test.dispose
})

afterAll(() => dispose())

beforeEach(async () => {
  await db.delete(schema.leadEvents)
  await db.delete(schema.leads)
  await db.delete(schema.settings)
})

// Asia/Colombo is UTC+5:30. 03:00Z is 08:30 local, 09:00Z is 14:30 local.
const day = (date: string, utcHour = 3) =>
  new Date(`${date}T0${utcHour}:00:00Z`)
const MON = day('2026-03-02')
const later = (seconds: number) => new Date(MON.getTime() + seconds * 1000)

const save = async (
  input = 'https://www.instagram.com/studio_x/',
  now = MON,
) => {
  const result = await saveLead(db, input, now)
  if (!result.ok) throw new Error(result.error)
  return result.id
}

const act = (action: Parameters<typeof applyLeadAction>[1], now: Date) =>
  applyLeadAction(db, action, now)

const getLead = async (id: string) =>
  (await db.select().from(schema.leads).where(eq(schema.leads.id, id)))[0]

const eventTypes = async (id: string) =>
  (await loadLeadDetail(db, id, MON))?.events.map((e) => e.type).reverse()

describe('saveLead', () => {
  it('saves a lead due today when saved before noon, with a CUID and one event', async () => {
    const id = await save()
    expect(isCuid(id)).toBe(true)
    expect(await getLead(id)).toMatchObject({
      platform: 'instagram',
      handle: 'studio_x',
      profileKey: 'instagram:studio_x',
      status: 'saved',
      nextActionOn: '2026-03-02',
    })
    expect(await eventTypes(id)).toEqual(['saved'])
  })

  it('saves a lead due tomorrow when saved after noon', async () => {
    const id = await save(undefined, day('2026-03-02', 9))
    expect((await getLead(id)).nextActionOn).toBe('2026-03-03')
  })

  it('returns the existing lead for the same profile, however it is written', async () => {
    const first = await save('https://www.instagram.com/Studio_X/?igsh=abc')
    const again = await saveLead(db, '@studio_x', MON)
    expect(again).toEqual({ ok: true, id: first, existing: true })
    expect(await db.select().from(schema.leads)).toHaveLength(1)
    expect(await db.select().from(schema.leadEvents)).toHaveLength(1)
  })

  it('rejects input that is not a profile and writes nothing', async () => {
    const result = await saveLead(db, 'hello there', MON)
    expect(result.ok).toBe(false)
    expect(await db.select().from(schema.leads)).toHaveLength(0)
  })
})

describe('applyLeadAction', () => {
  it('walks a lead through every step and writes one event per step', async () => {
    const id = await save()
    const at = (offset: number, hour = 3) =>
      day(`2026-03-${String(2 + offset).padStart(2, '0')}`, hour)

    expect(await act({ type: 'mark_messaged', id }, at(0, 4))).toEqual({
      ok: true,
    })
    expect(await getLead(id)).toMatchObject({
      status: 'messaged',
      nextActionOn: '2026-03-04',
      lastContactedAt: at(0, 4).toISOString(),
    })

    await act({ type: 'not_seen', id }, at(2))
    expect(await getLead(id)).toMatchObject({
      status: 'messaged',
      unseenChecks: 1,
      nextActionOn: '2026-03-06',
    })

    await act({ type: 'seen_no_reply', id }, at(4))
    expect(await getLead(id)).toMatchObject({
      status: 'seen',
      nextActionOn: '2026-03-09',
    })

    await act({ type: 'mark_followed_up', id }, at(7))
    expect(await getLead(id)).toMatchObject({
      status: 'messaged',
      followUps: 1,
      unseenChecks: 0,
      nextActionOn: '2026-03-12',
    })

    await act({ type: 'replied', id }, at(8))
    expect(await getLead(id)).toMatchObject({
      status: 'replied',
      nextActionOn: '2026-03-11',
    })

    await act({ type: 'won', id }, at(9))
    expect(await getLead(id)).toMatchObject({
      status: 'won',
      nextActionOn: null,
    })

    expect(await eventTypes(id)).toEqual([
      'saved',
      'messaged',
      'checked_unseen',
      'checked_seen',
      'followed_up',
      'replied',
      'won',
    ])
  })

  it('closes with a reason, then reopens with the counters kept', async () => {
    const id = await save()
    await act({ type: 'mark_messaged', id }, later(0))
    await act({ type: 'not_seen', id }, later(1))
    expect(
      await act({ type: 'close', id, reason: 'no_reply' }, later(2)),
    ).toEqual({
      ok: true,
    })
    expect(await getLead(id)).toMatchObject({
      status: 'closed',
      closeReason: 'no_reply',
      nextActionOn: null,
    })

    await act({ type: 'reopen', id }, later(3))
    expect(await getLead(id)).toMatchObject({
      status: 'saved',
      closeReason: null,
      unseenChecks: 1,
      nextActionOn: '2026-03-02',
    })
    expect((await eventTypes(id))?.slice(-2)).toEqual(['closed', 'reopened'])
  })

  it('reschedules an open lead and records the date', async () => {
    const id = await save()
    await act({ type: 'reschedule', id, date: '2026-04-01' }, later(1))
    expect((await getLead(id)).nextActionOn).toBe('2026-04-01')
    const detail = await loadLeadDetail(db, id, MON)
    expect(detail?.events[0]).toMatchObject({
      type: 'rescheduled',
      detail: '2026-04-01',
    })
  })

  it('rejects an invalid transition and changes nothing', async () => {
    const id = await save()
    const before = await getLead(id)
    const result = await act({ type: 'seen_no_reply', id }, MON)
    expect(result.ok).toBe(false)
    expect(await getLead(id)).toEqual(before)
    expect(await eventTypes(id)).toEqual(['saved'])
  })

  it('reports an unknown lead', async () => {
    expect(await act({ type: 'won', id: 'missing' }, MON)).toEqual({
      ok: false,
      error: 'Lead not found.',
    })
  })
})

describe('updateLeadDetails', () => {
  it('edits the name and note without touching the lifecycle', async () => {
    const id = await save()
    const before = await getLead(id)
    expect(
      await updateLeadDetails(db, { id, name: 'Studio X', note: 'Logo' }),
    ).toEqual({ ok: true })
    expect(await getLead(id)).toEqual({
      ...before,
      name: 'Studio X',
      note: 'Logo',
    })
    expect(await eventTypes(id)).toEqual(['saved'])
  })

  it('reports an unknown lead', async () => {
    const result = await updateLeadDetails(db, { id: 'x', name: '', note: '' })
    expect(result.ok).toBe(false)
  })
})

describe('loadLeads and Today groups', () => {
  it('uses the follow-up limit from settings and defaults to 2', async () => {
    expect((await loadLeads(db, MON)).maxFollowUps).toBe(2)
    await db
      .insert(schema.settings)
      .values({ id: 'main', businessName: 'Test', leadMaxFollowUps: 4 })
    expect((await loadLeads(db, MON)).maxFollowUps).toBe(4)
  })

  it('returns today in Sri Lanka time', async () => {
    expect((await loadLeads(db, new Date('2026-03-02T20:00:00Z'))).today).toBe(
      '2026-03-03',
    )
  })

  it('places due leads in their group and flags overdue ones', async () => {
    const a = await save('@alpha', day('2026-03-01'))
    const b = await save('@beta', day('2026-03-02'))
    const c = await save('@gamma', day('2026-03-02'))
    await save('@later', day('2026-03-04', 9)) // due Mar 5
    await act({ type: 'mark_messaged', id: b }, day('2026-03-02')) // due Mar 4
    await act({ type: 'mark_messaged', id: c }, day('2026-03-02'))
    await act({ type: 'replied', id: c }, day('2026-03-02')) // due Mar 3

    const { leads, today } = await loadLeads(db, day('2026-03-04'))
    expect(today).toBe('2026-03-04')
    const groups = Object.fromEntries(
      groupTodayLeads(leads, today).map((g) => [
        g.id,
        g.leads.map((l) => l.handle),
      ]),
    )
    expect(groups).toEqual({
      first_message: ['alpha'], // @later is not due yet
      check_seen: ['beta'],
      follow_up: [],
      in_conversation: ['gamma'],
    })
    const byId = Object.fromEntries(leads.map((l) => [l.id, l]))
    expect(isOverdue(byId[a], today)).toBe(true)
    expect(isOverdue(byId[b], today)).toBe(false)
  })

  it('leaves won and closed leads out of Today', async () => {
    const id = await save()
    await act({ type: 'close', id, reason: 'bad_fit' }, MON)
    const { leads, today } = await loadLeads(db, MON)
    expect(groupTodayLeads(leads, today).flatMap((g) => g.leads)).toHaveLength(
      0,
    )
    expect(leads).toHaveLength(1)
  })
})

describe('input schemas', () => {
  it('accepts every action and rejects unknown ones and extra fields', () => {
    for (const type of [
      'mark_messaged',
      'not_seen',
      'seen_no_reply',
      'mark_followed_up',
      'replied',
      'won',
      'reopen',
    ]) {
      expect(leadActionSchema.safeParse({ type, id: 'a' }).success).toBe(true)
    }
    expect(
      leadActionSchema.safeParse({ type: 'close', id: 'a', reason: 'bad_fit' })
        .success,
    ).toBe(true)
    expect(
      leadActionSchema.safeParse({ type: 'close', id: 'a', reason: 'rude' })
        .success,
    ).toBe(false)
    expect(
      leadActionSchema.safeParse({
        type: 'reschedule',
        id: 'a',
        date: '2026-02-30',
      }).success,
    ).toBe(false)
    expect(leadActionSchema.safeParse({ type: 'save', id: 'a' }).success).toBe(
      false,
    )
    expect(
      leadActionSchema.safeParse({ type: 'won', id: 'a', status: 'won' })
        .success,
    ).toBe(false)
  })

  it('limits the details fields', () => {
    expect(
      leadDetailsSchema.safeParse({ id: 'a', name: 'x'.repeat(121), note: '' })
        .success,
    ).toBe(false)
  })
})
