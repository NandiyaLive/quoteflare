import { describe, expect, it, vi } from 'vitest'
import { isRateLimited, tooManyRequests } from './rate-limit'

const limiter = (success: boolean) =>
  ({ limit: vi.fn(async () => ({ success })) }) as unknown as RateLimit & {
    limit: ReturnType<typeof vi.fn>
  }

const request = (ip?: string) =>
  new Request('https://example.test/i/token', {
    headers: ip ? { 'cf-connecting-ip': ip } : {},
  })

describe('isRateLimited', () => {
  it('keys the limit on the client IP', async () => {
    const binding = limiter(true)
    expect(await isRateLimited(binding, request('203.0.113.7'))).toBe(false)
    expect(binding.limit).toHaveBeenCalledWith({ key: '203.0.113.7' })
  })

  it('reports a request over the limit', async () => {
    expect(await isRateLimited(limiter(false), request('203.0.113.7'))).toBe(
      true,
    )
  })

  it('allows the request without a binding or an IP', async () => {
    const binding = limiter(false)
    expect(await isRateLimited(undefined, request('203.0.113.7'))).toBe(false)
    expect(await isRateLimited(binding, request())).toBe(false)
    expect(binding.limit).not.toHaveBeenCalled()
  })
})

describe('tooManyRequests', () => {
  it('returns an uncached 429 with Retry-After', () => {
    const response = tooManyRequests()
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})
