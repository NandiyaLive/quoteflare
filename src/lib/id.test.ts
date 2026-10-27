import { describe, expect, it } from 'vitest'
import { createPublicToken, isPublicToken } from './id'

describe('public token', () => {
  it('is 32 hex characters and unique', () => {
    const tokens = new Set(Array.from({ length: 200 }, createPublicToken))
    expect(tokens.size).toBe(200)
    for (const token of tokens) expect(isPublicToken(token)).toBe(true)
  })

  it('rejects other shapes', () => {
    for (const value of [
      '',
      'abc',
      'A'.repeat(32),
      'g'.repeat(32),
      'a'.repeat(33),
    ]) {
      expect(isPublicToken(value)).toBe(false)
    }
  })
})
