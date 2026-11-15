// Web Push for Workers, using only WebCrypto. VAPID authentication is RFC 8292
// and payload encryption is RFC 8291 with the aes128gcm content coding (RFC 8188).

const encoder = new TextEncoder()

export function base64urlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export type VapidKeys = {
  /** Uncompressed P-256 public key, 65 bytes, base64url. */
  publicKey: string
  /** P-256 private scalar, 32 bytes, base64url. */
  privateKey: string
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const publicRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', pair.publicKey),
  )
  return { publicKey: base64urlEncode(publicRaw), privateKey: jwk.d! }
}

async function importSigningKey(keys: VapidKeys) {
  const publicRaw = base64urlDecode(keys.publicKey)
  if (publicRaw.length !== 65 || publicRaw[0] !== 4) {
    throw new Error('VAPID public key must be an uncompressed P-256 point.')
  }
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: base64urlEncode(publicRaw.slice(1, 33)),
      y: base64urlEncode(publicRaw.slice(33, 65)),
      d: keys.privateKey,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
}

/** Builds the `Authorization` header value for one push service origin. */
export async function vapidAuthorization(
  endpoint: string,
  subject: string,
  keys: VapidKeys,
  now: Date,
): Promise<string> {
  const header = base64urlEncode(
    encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })),
  )
  const claims = base64urlEncode(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        // Push services reject tokens that live longer than 24 hours.
        exp: Math.floor(now.getTime() / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  )
  const signingInput = `${header}.${claims}`
  // WebCrypto returns the raw r || s form that JWT expects for ES256.
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      await importSigningKey(keys),
      encoder.encode(signingInput),
    ),
  )
  return `vapid t=${signingInput}.${base64urlEncode(signature)}, k=${keys.publicKey}`
}

async function hkdf(
  secret: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  bytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', secret, 'HKDF', false, [
    'deriveBits',
  ])
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info },
      key,
      bytes * 8,
    ),
  )
}

export type PushKeys = { p256dh: string; auth: string }

const RECORD_SIZE = 4096

/**
 * Encrypts a payload for one subscription. The result is the request body,
 * sent with `Content-Encoding: aes128gcm`. The salt and sender key are
 * random unless a test passes fixed ones.
 */
export async function encryptPayload(
  payload: Uint8Array<ArrayBuffer>,
  keys: PushKeys,
  fixed?: { salt: Uint8Array<ArrayBuffer>; senderKeys: CryptoKeyPair },
): Promise<Uint8Array<ArrayBuffer>> {
  // One record holds the payload, a delimiter byte and the 16-byte GCM tag.
  if (payload.length > RECORD_SIZE - 17) {
    throw new Error('Push payload is too large.')
  }
  const receiverPublic = base64urlDecode(keys.p256dh)
  const authSecret = base64urlDecode(keys.auth)
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const senderKeys =
    fixed?.senderKeys ??
    (await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    ))
  const senderPublic = new Uint8Array(
    await crypto.subtle.exportKey('raw', senderKeys.publicKey),
  )

  const receiverKey = await crypto.subtle.importKey(
    'raw',
    receiverPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: receiverKey },
      senderKeys.privateKey,
      256,
    ),
  )

  const keyInfo = concat(
    encoder.encode('WebPush: info\0'),
    receiverPublic,
    senderPublic,
  )
  const ikm = await hkdf(sharedSecret, authSecret, keyInfo, 32)
  const cek = await hkdf(
    ikm,
    salt,
    encoder.encode('Content-Encoding: aes128gcm\0'),
    16,
  )
  const nonce = await hkdf(
    ikm,
    salt,
    encoder.encode('Content-Encoding: nonce\0'),
    12,
  )

  // 0x02 marks the last (here the only) record.
  const plaintext = concat(payload, new Uint8Array([2]))
  const cipherKey = await crypto.subtle.importKey(
    'raw',
    cek,
    'AES-GCM',
    false,
    ['encrypt'],
  )
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      cipherKey,
      plaintext,
    ),
  )

  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE)
  return concat(
    salt,
    recordSize,
    new Uint8Array([senderPublic.length]),
    senderPublic,
    ciphertext,
  )
}

export type PushTarget = { endpoint: string } & PushKeys

export type PushResult =
  | { ok: true }
  // `gone` means the push service says the subscription no longer exists.
  | { ok: false; gone: boolean; status: number | null; error: string }

export type PushDeps = {
  vapid: VapidKeys
  /** A `mailto:` or `https:` contact the push service can reach. */
  subject: string
  fetcher?: typeof fetch
  now?: Date
}

/** Sends one notification. It never throws on a failed delivery. */
export async function sendWebPush(
  target: PushTarget,
  message: unknown,
  deps: PushDeps,
): Promise<PushResult> {
  try {
    const url = new URL(target.endpoint)
    if (url.protocol !== 'https:') {
      return {
        ok: false,
        gone: true,
        status: null,
        error: 'Endpoint is not https.',
      }
    }
    const body = await encryptPayload(
      encoder.encode(JSON.stringify(message)),
      target,
    )
    const response = await (deps.fetcher ?? fetch)(target.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthorization(
          target.endpoint,
          deps.subject,
          deps.vapid,
          deps.now ?? new Date(),
        ),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        // Keep the notification for up to a day, then drop it.
        TTL: '86400',
        Urgency: 'normal',
      },
      body,
    })
    if (response.ok) return { ok: true }
    return {
      ok: false,
      // 404 and 410 are the documented answers for an expired or revoked subscription.
      gone: response.status === 404 || response.status === 410,
      status: response.status,
      error: `Push service answered ${response.status}.`,
    }
  } catch (error) {
    return {
      ok: false,
      gone: false,
      status: null,
      error: error instanceof Error ? error.message : 'Push failed.',
    }
  }
}
