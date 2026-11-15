import { describe, expect, it } from 'vitest'
import {
  base64urlDecode,
  base64urlEncode,
  encryptPayload,
  generateVapidKeys,
  sendWebPush,
  vapidAuthorization,
} from './web-push'

const decoder = new TextDecoder()
const encoder = new TextEncoder()

async function receiver() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )
  const auth = crypto.getRandomValues(new Uint8Array(16))
  const publicRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', pair.publicKey),
  )
  return {
    pair,
    publicRaw,
    auth,
    keys: { p256dh: base64urlEncode(publicRaw), auth: base64urlEncode(auth) },
  }
}

const hmac = async (
  key: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
) =>
  new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      ),
      data,
    ),
  )

/** RFC 8291 section 3.4, written out with HMAC so it does not share code with the encryptor. */
async function decrypt(
  body: Uint8Array<ArrayBuffer>,
  r: Awaited<ReturnType<typeof receiver>>,
) {
  const salt = body.slice(0, 16)
  const idLen = body[20]
  const senderPublic = body.slice(21, 21 + idLen)
  const ciphertext = body.slice(21 + idLen)

  const senderKey = await crypto.subtle.importKey(
    'raw',
    senderPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: senderKey },
      r.pair.privateKey,
      256,
    ),
  )
  const prkKey = await hmac(r.auth, ecdh)
  const keyInfo = new Uint8Array([
    ...encoder.encode('WebPush: info\0'),
    ...r.publicRaw,
    ...senderPublic,
    1,
  ])
  const ikm = (await hmac(prkKey, keyInfo)).slice(0, 32)
  const prk = await hmac(salt, ikm)
  const cek = (
    await hmac(
      prk,
      new Uint8Array([...encoder.encode('Content-Encoding: aes128gcm\0'), 1]),
    )
  ).slice(0, 16)
  const nonce = (
    await hmac(
      prk,
      new Uint8Array([...encoder.encode('Content-Encoding: nonce\0'), 1]),
    )
  ).slice(0, 12)
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']),
      ciphertext,
    ),
  )
  expect(plain[plain.length - 1]).toBe(2)
  return plain.slice(0, -1)
}

describe('encryptPayload', () => {
  it('produces a body the receiver can decrypt', async () => {
    const r = await receiver()
    const body = await encryptPayload(
      encoder.encode(JSON.stringify({ title: '3 leads due today' })),
      r.keys,
    )
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096)
    expect(body[20]).toBe(65)
    expect(JSON.parse(decoder.decode(await decrypt(body, r)))).toEqual({
      title: '3 leads due today',
    })
  })

  it('uses a new salt and sender key each time', async () => {
    const r = await receiver()
    const a = await encryptPayload(encoder.encode('x'), r.keys)
    const b = await encryptPayload(encoder.encode('x'), r.keys)
    expect(base64urlEncode(a.slice(0, 16))).not.toBe(
      base64urlEncode(b.slice(0, 16)),
    )
  })

  it('rejects a payload that does not fit one record', async () => {
    const r = await receiver()
    await expect(encryptPayload(new Uint8Array(4096), r.keys)).rejects.toThrow(
      'too large',
    )
  })
})

describe('vapidAuthorization', () => {
  it('signs a JWT for the push service origin that verifies with the public key', async () => {
    const keys = await generateVapidKeys()
    const now = new Date('2026-06-15T03:30:00Z')
    const header = await vapidAuthorization(
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://quote.example.test',
      keys,
      now,
    )
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)
    expect(match).not.toBeNull()
    const [, h, c, s, k] = match!
    expect(k).toBe(keys.publicKey)
    expect(JSON.parse(decoder.decode(base64urlDecode(h)))).toEqual({
      typ: 'JWT',
      alg: 'ES256',
    })
    const claims = JSON.parse(decoder.decode(base64urlDecode(c)))
    expect(claims).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: Math.floor(now.getTime() / 1000) + 12 * 3600,
      sub: 'https://quote.example.test',
    })
    const publicKey = await crypto.subtle.importKey(
      'raw',
      base64urlDecode(keys.publicKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    expect(base64urlDecode(s)).toHaveLength(64)
    expect(
      await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        base64urlDecode(s),
        encoder.encode(`${h}.${c}`),
      ),
    ).toBe(true)
  })
})

describe('sendWebPush', () => {
  const deps = async (fetcher: typeof fetch) => ({
    vapid: await generateVapidKeys(),
    subject: 'https://quote.example.test',
    fetcher,
  })

  it('posts an encrypted body with the VAPID and encoding headers', async () => {
    const r = await receiver()
    let seen: { url: string; init: RequestInit } | undefined
    const fetcher = (async (url: string, init: RequestInit) => {
      seen = { url, init }
      return new Response(null, { status: 201 })
    }) as typeof fetch
    const result = await sendWebPush(
      { endpoint: 'https://push.example.test/abc', ...r.keys },
      { title: 'Hi' },
      await deps(fetcher),
    )
    expect(result).toEqual({ ok: true })
    const headers = seen!.init.headers as Record<string, string>
    expect(seen!.url).toBe('https://push.example.test/abc')
    expect(headers['Content-Encoding']).toBe('aes128gcm')
    expect(headers.TTL).toBe('86400')
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=.+$/)
    const plain = await decrypt(seen!.init.body as Uint8Array<ArrayBuffer>, r)
    expect(JSON.parse(decoder.decode(plain))).toEqual({ title: 'Hi' })
  })

  it.each([404, 410])(
    'reports status %i as a gone subscription',
    async (status) => {
      const r = await receiver()
      const result = await sendWebPush(
        { endpoint: 'https://push.example.test/abc', ...r.keys },
        {},
        await deps(
          (async () => new Response(null, { status })) as typeof fetch,
        ),
      )
      expect(result).toMatchObject({ ok: false, gone: true, status })
    },
  )

  it('keeps the subscription on a server error or a network failure', async () => {
    const r = await receiver()
    const target = { endpoint: 'https://push.example.test/abc', ...r.keys }
    expect(
      await sendWebPush(
        target,
        {},
        await deps(
          (async () => new Response(null, { status: 503 })) as typeof fetch,
        ),
      ),
    ).toMatchObject({ ok: false, gone: false, status: 503 })
    expect(
      await sendWebPush(
        target,
        {},
        await deps((async () => {
          throw new Error('offline')
        }) as typeof fetch),
      ),
    ).toMatchObject({ ok: false, gone: false, error: 'offline' })
  })

  it('refuses a plain http endpoint without calling it', async () => {
    const r = await receiver()
    let called = false
    const result = await sendWebPush(
      { endpoint: 'http://push.example.test/abc', ...r.keys },
      {},
      await deps((async () => {
        called = true
        return new Response(null)
      }) as typeof fetch),
    )
    expect(result).toMatchObject({ ok: false, gone: true })
    expect(called).toBe(false)
  })
})
