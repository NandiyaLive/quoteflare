import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  ACCESS_JWT_COOKIE,
  ACCESS_JWT_HEADER,
  authenticateAdmin,
} from './access'

const teamDomain = 'team.cloudflareaccess.com'
const audience = 'aud-123'
const config = { teamDomain, audience }

let privateKey: CryptoKey
let otherPrivateKey: CryptoKey
let getKey: ReturnType<typeof createLocalJWKSet>

const sign = (
  key: CryptoKey,
  claims: { email?: string; iss?: string; aud?: string; exp?: string } = {},
) =>
  new SignJWT({ email: claims.email ?? 'me@example.com' })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(claims.iss ?? `https://${teamDomain}`)
    .setAudience(claims.aud ?? audience)
    .setIssuedAt()
    .setExpirationTime(claims.exp ?? '5m')
    .sign(key)

const requestWith = (token?: string, url = 'https://quote.example.com/admin') =>
  new Request(url, token ? { headers: { [ACCESS_JWT_HEADER]: token } } : {})

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  privateKey = pair.privateKey
  otherPrivateKey = (await generateKeyPair('RS256')).privateKey
  getKey = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' }],
  })
})

describe('authenticateAdmin', () => {
  it('returns the email from a valid token', async () => {
    const token = await sign(privateKey)
    expect(await authenticateAdmin(requestWith(token), config, getKey)).toEqual(
      { email: 'me@example.com' },
    )
  })

  it('accepts the token from the CF_Authorization cookie', async () => {
    const token = await sign(privateKey)
    const request = new Request('https://quote.example.com/_serverFn/abc', {
      headers: { Cookie: `theme=dark; ${ACCESS_JWT_COOKIE}=${token}` },
    })
    expect(await authenticateAdmin(request, config, getKey)).toEqual({
      email: 'me@example.com',
    })
  })

  it('rejects a missing header', async () => {
    expect(await authenticateAdmin(requestWith(), config, getKey)).toBeNull()
  })

  it('rejects a tampered payload', async () => {
    const [h, , s] = (await sign(privateKey)).split('.')
    const forged = btoa(
      JSON.stringify({
        email: 'evil@example.com',
        iss: `https://${teamDomain}`,
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
    ).replace(/=+$/, '')
    expect(
      await authenticateAdmin(
        requestWith(`${h}.${forged}.${s}`),
        config,
        getKey,
      ),
    ).toBeNull()
  })

  it('rejects a token signed by another key', async () => {
    const token = await sign(otherPrivateKey)
    expect(
      await authenticateAdmin(requestWith(token), config, getKey),
    ).toBeNull()
  })

  it('rejects the wrong audience, issuer, or an expired token', async () => {
    for (const claims of [
      { aud: 'other' },
      { iss: 'https://evil.cloudflareaccess.com' },
      { exp: '-1m' },
    ]) {
      const token = await sign(privateKey, claims)
      expect(
        await authenticateAdmin(requestWith(token), config, getKey),
      ).toBeNull()
    }
  })

  it('rejects garbage and an unconfigured audience', async () => {
    expect(
      await authenticateAdmin(requestWith('not-a-jwt'), config, getKey),
    ).toBeNull()
    const token = await sign(privateKey)
    expect(
      await authenticateAdmin(requestWith(token), { teamDomain }, getKey),
    ).toBeNull()
  })

  it('uses the dev email only on localhost', async () => {
    const dev = { devEmail: 'dev@example.test' }
    expect(
      await authenticateAdmin(
        requestWith(undefined, 'http://localhost:3000/admin'),
        dev,
        getKey,
      ),
    ).toEqual({ email: 'dev@example.test' })
    expect(await authenticateAdmin(requestWith(), dev, getKey)).toBeNull()
  })

  it('uses the dev email on any host when DEV is true', async () => {
    const dev = { devEmail: 'dev@example.test', dev: 'true' }
    expect(await authenticateAdmin(requestWith(), dev, getKey)).toEqual({
      email: 'dev@example.test',
    })
    expect(
      await authenticateAdmin(requestWith(), { dev: 'true' }, getKey),
    ).toEqual({ email: 'dev@localhost' })
    expect(
      await authenticateAdmin(
        requestWith(),
        { devEmail: 'dev@example.test', dev: 'false' },
        getKey,
      ),
    ).toBeNull()
  })

  it('ignores DEV when a team domain is configured', async () => {
    expect(
      await authenticateAdmin(
        requestWith(),
        { ...config, dev: 'true' },
        getKey,
      ),
    ).toBeNull()
  })

  it('ignores the dev identity when a team domain is configured', async () => {
    const request = new Request('http://localhost:3000/admin')
    expect(
      await authenticateAdmin(
        request,
        { ...config, devEmail: 'dev@example.test' },
        getKey,
      ),
    ).toBeNull()
  })
})
