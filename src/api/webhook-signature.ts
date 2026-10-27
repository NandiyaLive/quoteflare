const TOLERANCE_SECONDS = 300

export type WebhookHeaders = {
  id: string | null
  timestamp: string | null
  signature: string | null
}

const decodeBase64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0))

const equalBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i])

/**
 * Verifies a Resend (Svix) webhook. The signed content is
 * `<id>.<timestamp>.<raw body>`, signed with HMAC-SHA256 using the base64 part
 * of the `whsec_` secret. The signature header holds space separated
 * `v1,<base64>` entries and any one of them may match.
 */
export async function verifyWebhookSignature(
  secret: string | undefined,
  headers: WebhookHeaders,
  body: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) {
    return false
  }
  const timestamp = Number(headers.timestamp)
  if (
    !Number.isInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS
  ) {
    return false
  }

  let key: CryptoKey
  try {
    key = await crypto.subtle.importKey(
      'raw',
      decodeBase64(secret.replace(/^whsec_/, '')),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
  } catch {
    return false
  }
  const expected = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${headers.id}.${headers.timestamp}.${body}`),
    ),
  )

  return headers.signature.split(' ').some((entry) => {
    const [version, value] = entry.split(',')
    if (version !== 'v1' || !value) return false
    try {
      return equalBytes(decodeBase64(value), expected)
    } catch {
      return false
    }
  })
}
