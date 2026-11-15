import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb, schema, type Db } from '#/db'
import { createTestD1 } from '#/db/test-db'
import { computeLeadStats } from '#/lib/lead-stats'
import { applyLeadAction, loadLeadStats, saveLead } from './leads'

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

const NOW = new Date('2026-06-30T06:00:00Z')
const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000)

const save = async (input: string, when = at(1)) => {
  const result = await saveLead(db, input, when)
  if (!result.ok) throw new Error(result.error)
  return result.id
}

type Step = Parameters<typeof applyLeadAction>[1]
const act = async (action: Step, when = at(1)) => {
  const result = await applyLeadAction(db, action, when)
  if (!result.ok) throw new Error(result.error)
}

const messaged = (id: string, when = at(1)) =>
  act({ type: 'mark_messaged', id }, when)
const replied = (id: string, when = at(1)) =>
  act({ type: 'replied', id }, when)
const won = (id: string, when = at(1)) => act({ type: 'won', id }, when)
const closeNoReply = (id: string, when = at(1)) =>
  act({ type: 'close', id, reason: 'no_reply' }, when)

/** 20 leads: 10 Instagram, 6 Facebook and 4 LinkedIn. */
async function seed() {
  const ig = await Promise.all(
    Array.from({ length: 10 }, (_, i) => save(`@ig_${i}`)),
  )
  // 8 messaged, 4 replied, 2 won, 2 closed as no reply.
  for (const id of ig.slice(0, 8)) await messaged(id)
  for (const id of ig.slice(0, 4)) await replied(id)
  for (const id of ig.slice(0, 2)) await won(id)
  for (const id of ig.slice(4, 6)) await closeNoReply(id)
  // A closed then reopened lead still counts for its earlier steps.
  await act({ type: 'reopen', id: ig[4] })

  const fb = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      save(`https://www.facebook.com/fb.${i}`),
    ),
  )
  // 3 messaged, 1 replied, 1 closed as no reply.
  for (const id of fb.slice(0, 3)) await messaged(id)
  await replied(fb[0])
  await closeNoReply(fb[1])

  // 4 saved, none messaged.
  for (let i = 0; i < 4; i++) {
    await save(`https://www.linkedin.com/in/li-${i}/`)
  }
}

const row = (stats: Awaited<ReturnType<typeof loadLeadStats>>, p: string) =>
  stats.find((r) => r.platform === p)

describe('loadLeadStats', () => {
  it('matches a hand count of 20 leads across three platforms', async () => {
    await seed()
    const stats = await loadLeadStats(db, 30, NOW)
    expect(row(stats, 'instagram')).toEqual({
      platform: 'instagram',
      saved: 10,
      messaged: 8,
      replied: 4,
      won: 2,
      closedNoReply: 2,
      replyRate: 0.5,
      winRate: 0.25,
    })
    expect(row(stats, 'facebook')).toEqual({
      platform: 'facebook',
      saved: 6,
      messaged: 3,
      replied: 1,
      won: 0,
      closedNoReply: 1,
      replyRate: 1 / 3,
      winRate: 0,
    })
    expect(row(stats, 'linkedin')).toMatchObject({ saved: 4, messaged: 0 })
    expect(stats.map((r) => r.platform)).toEqual([
      'instagram',
      'facebook',
      'linkedin',
    ])
  })

  it('shows null rates, not a division error, for a platform with nothing messaged', async () => {
    await seed()
    const linkedin = row(await loadLeadStats(db, 30, NOW), 'linkedin')
    expect(linkedin?.replyRate).toBeNull()
    expect(linkedin?.winRate).toBeNull()
  })

  it('counts a lead once per step when it repeats the step', async () => {
    const id = await save('@repeat')
    await messaged(id)
    await act({ type: 'seen_no_reply', id })
    await act({ type: 'mark_followed_up', id })
    await act({ type: 'seen_no_reply', id })
    await act({ type: 'mark_followed_up', id })
    const stats = await loadLeadStats(db, 30, NOW)
    expect(row(stats, 'instagram')).toMatchObject({ saved: 1, messaged: 1 })
  })

  it('leaves out events older than the period', async () => {
    const id = await save('@old', at(100))
    await messaged(id, at(100))
    await replied(id, at(5))
    expect(row(await loadLeadStats(db, 30, NOW), 'instagram')).toMatchObject({
      saved: 0,
      messaged: 0,
      replied: 1,
      replyRate: null,
    })
    expect(row(await loadLeadStats(db, 365, NOW), 'instagram')).toMatchObject({
      saved: 1,
      messaged: 1,
      replied: 1,
      replyRate: 1,
    })
  })

  it('returns nothing when there are no leads', async () => {
    expect(await loadLeadStats(db, 90, NOW)).toEqual([])
  })
})

describe('computeLeadStats', () => {
  it('counts only closed events with the no_reply reason as no reply', () => {
    const event = (detail: string, leadId: string) => ({
      leadId,
      platform: 'x' as const,
      type: 'closed',
      detail,
      createdAt: at(1).toISOString(),
    })
    const stats = computeLeadStats(
      [event('no_reply', 'a'), event('bad_fit', 'b')],
      NOW,
      30,
    )
    expect(stats[0].closedNoReply).toBe(1)
  })
})
