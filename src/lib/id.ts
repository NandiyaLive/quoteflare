import { createId, isCuid } from '@paralleldrive/cuid2'

export { createId, isCuid }

/** 32 hex characters (128 bits) for public invoice links. Not a database ID. */
export function createPublicToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const isPublicToken = (value: string) => /^[0-9a-f]{32}$/.test(value)
