/**
 * Applies a Workers rate limit binding per client IP. A missing binding (local
 * dev, tests) or a missing IP allows the request.
 */
export async function isRateLimited(
  limiter: RateLimit | undefined,
  request: Request,
): Promise<boolean> {
  const ip = request.headers.get('cf-connecting-ip')
  if (!limiter || !ip) return false
  const { success } = await limiter.limit({ key: ip })
  return !success
}

export const tooManyRequests = () =>
  new Response('Too many requests.', {
    status: 429,
    headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' },
  })
