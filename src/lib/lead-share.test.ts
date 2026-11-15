import { describe, expect, it } from 'vitest'
import { pickSharedInput } from './lead-share'
import { parseProfileUrl } from './leads'

describe('pickSharedInput', () => {
  it('prefers a url that parses', () => {
    expect(
      pickSharedInput({ url: 'https://www.instagram.com/Studio_X/?igsh=abc' }),
    ).toBe('https://www.instagram.com/Studio_X/?igsh=abc')
  })
  it('finds the link inside shared text', () => {
    const text = 'Check this out https://www.instagram.com/studio_x/?igsh=abc'
    const picked = pickSharedInput({ text })
    const a = parseProfileUrl(picked)
    expect(a.ok && a.profileKey).toBe('instagram:studio_x')
  })
  it('skips an unparsable url when text has a profile', () => {
    expect(pickSharedInput({ url: 'nonsense', text: '@studio_x' })).toBe(
      '@studio_x',
    )
  })
  it('returns the raw value when nothing parses, so it can be corrected', () => {
    expect(pickSharedInput({ text: 'hello there' })).toBe('hello there')
    expect(pickSharedInput({})).toBe('')
  })
})
