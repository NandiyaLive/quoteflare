import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb, schema, type Db } from '#/db'
import { createTestD1 } from '#/db/test-db'
import { runDailyJobs } from '#/jobs/daily'
import { base64urlEncode, generateVapidKeys } from '#/lib/web-push'
import { sendLeadPush } from './lead-push'

let db: Db
let d1: D1Database
let dispose: () => Promise<void>
let vapid: Awaited<ReturnType<typeof generateVapidKeys>>

beforeAll(async () => {
  const test = await createTestD1()
  d1 = test.d1
  db = createDb(d1)
  dispose = test.dispose
  vapid = await generateVapidKeys()
})
afterAll(() => dispose())

const now = new Date('2026-06-15T03:30:00Z')

async function addDevice(name: string) {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )
  await db.insert(schema.pushSubscriptions).values({
    endpoint: `https://push.example.test/${name}`,
    p256dh: base64urlEncode(
      new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)),
    ),
    auth: base64urlEncode(crypto.getRandomValues(new Uint8Array(16))),
  })
}

const addLead = (handle: string, nextActionOn: string | null) =>
  db.insert(schema.leads).values({
    platform: 'instagram',
    handle,
    profileUrl: `https://www.instagram.com/${handle}/`,
    profileKey: `instagram:${handle}`,
    status: 'saved',
    nextActionOn,
  })

const setDigest = async (on: boolean) => {
  await db.delete(schema.settings)
  await db.insert(schema.settings).values({
    id: 'main',
    businessName: 'Studio',
    email: 'owner@example.test',
    currency: 'LKR',
    sendLeadDigest: on,
  })
}

type Call = { url: string }
const fakePush = (statusFor: (url: string) => number = () => 201) => {
  const calls: Call[] = []
  const fetcher = (async (url: string) => {
    calls.push({ url })
    return new Response(null, { status: statusFor(url) })
  }) as typeof fetch
  return { calls, fetcher }
}

const deps = (fetcher: typeof fetch) => ({
  vapidPublicKey: vapid.publicKey,
  vapidPrivateKey: vapid.privateKey,
  origin: 'https://invoices.example.test',
  fetcher,
})

beforeEach(async () => {
  await db.delete(schema.pushSubscriptions)
  await db.delete(schema.leads)
  await setDigest(true)
})

describe('sendLeadPush', () => {
  it('pushes to every device when leads are due', async () => {
    await addLead('a', '2026-06-15')
    await addDevice('one')
    await addDevice('two')
    const { calls, fetcher } = fakePush()
    const result = await sendLeadPush(db, deps(fetcher), now)
    expect(result).toEqual({ sent: 2, failed: 0, removed: 0 })
    expect(calls.map((c) => c.url).sort()).toEqual([
      'https://push.example.test/one',
      'https://push.example.test/two',
    ])
  })

  it('sends a device only one push per day', async () => {
    await addLead('a', '2026-06-15')
    await addDevice('one')
    const { calls, fetcher } = fakePush()
    await sendLeadPush(db, deps(fetcher), now)
    const again = await sendLeadPush(db, deps(fetcher), now)
    expect(again).toMatchObject({ sent: 0, skipped: 'no_subscriptions' })
    expect(calls).toHaveLength(1)
    const tomorrow = new Date('2026-06-16T03:30:00Z')
    // The lead is now overdue, so it is still due, and the device is eligible again.
    await sendLeadPush(db, deps(fetcher), tomorrow)
    expect(calls).toHaveLength(2)
    await sendLeadPush(db, deps(fetcher), tomorrow)
    expect(calls).toHaveLength(2)
  })

  it('deletes a subscription the push service reports as gone', async () => {
    await addLead('a', '2026-06-15')
    await addDevice('live')
    await addDevice('revoked')
    await addDevice('flaky')
    const { fetcher } = fakePush((url) =>
      url.endsWith('revoked') ? 410 : url.endsWith('flaky') ? 503 : 201,
    )
    const result = await sendLeadPush(db, deps(fetcher), now)
    expect(result).toEqual({ sent: 1, failed: 2, removed: 1 })
    const left = (await db.select().from(schema.pushSubscriptions)).map((d) =>
      d.endpoint.split('/').pop(),
    )
    expect(left.sort()).toEqual(['flaky', 'live'])
  })

  it('sends nothing when no lead is due', async () => {
    await addLead('later', '2026-06-16')
    await addDevice('one')
    const { calls, fetcher } = fakePush()
    expect(await sendLeadPush(db, deps(fetcher), now)).toMatchObject({
      sent: 0,
      skipped: 'nothing_due',
    })
    expect(calls).toHaveLength(0)
  })

  it('sends nothing when the switch is off', async () => {
    await setDigest(false)
    await addLead('a', '2026-06-15')
    await addDevice('one')
    const { calls, fetcher } = fakePush()
    expect(await sendLeadPush(db, deps(fetcher), now)).toMatchObject({
      skipped: 'disabled',
    })
    expect(calls).toHaveLength(0)
  })

  it('sends nothing when the VAPID keys are not set', async () => {
    await addLead('a', '2026-06-15')
    await addDevice('one')
    const { calls, fetcher } = fakePush()
    const result = await sendLeadPush(
      db,
      { ...deps(fetcher), vapidPrivateKey: undefined },
      now,
    )
    expect(result).toMatchObject({ skipped: 'not_configured' })
    expect(calls).toHaveLength(0)
  })
})

describe('daily job push step', () => {
  it('reports the push through runDailyJobs', async () => {
    await addLead('a', '2026-06-15')
    await addDevice('one')
    const { calls, fetcher: push } = fakePush()
    const fetcher = (async (url: string, init: RequestInit) =>
      url.includes('push.example.test')
        ? push(url, init)
        : Response.json({ id: 're_1' })) as typeof fetch
    const result = await runDailyJobs(
      {
        DB: d1,
        RESEND_API_KEY: 're_test',
        EMAIL_FROM: 'Invoices <invoices@example.test>',
        APP_ORIGIN: 'https://invoices.example.test',
        VAPID_PUBLIC_KEY: vapid.publicKey,
        VAPID_PRIVATE_KEY: vapid.privateKey,
      },
      now,
      fetcher,
    )
    expect(result.leadPushSent).toBe(1)
    expect(calls).toHaveLength(1)
  })
})
