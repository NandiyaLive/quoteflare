import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { JWTVerifyGetKey } from 'jose'

export const ACCESS_JWT_HEADER = 'Cf-Access-Jwt-Assertion'
export const ACCESS_JWT_COOKIE = 'CF_Authorization'

export type AccessConfig = {
  teamDomain?: string
  audience?: string
  devEmail?: string
}

export type AdminIdentity = { email: string }

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

const keySets = new Map<string, JWTVerifyGetKey>()

function keySetFor(teamDomain: string): JWTVerifyGetKey {
  let keys = keySets.get(teamDomain)
  if (!keys) {
    keys = createRemoteJWKSet(
      new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
    )
    keySets.set(teamDomain, keys)
  }
  return keys
}

// Access only adds the header to paths its application covers (/admin/*).
// Server function calls go to /_serverFn/*, so they carry the same JWT only in
// the CF_Authorization cookie.
function accessToken(request: Request): string | null {
  const header = request.headers.get(ACCESS_JWT_HEADER)
  if (header) return header
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === ACCESS_JWT_COOKIE) return value.join('=') || null
  }
  return null
}

export async function authenticateAdmin(
  request: Request,
  config: AccessConfig,
  getKey?: JWTVerifyGetKey,
): Promise<AdminIdentity | null> {
  // Never trust the dev identity once Access is configured.
  if (
    config.devEmail &&
    !config.teamDomain &&
    LOCAL_HOSTS.has(new URL(request.url).hostname)
  ) {
    return { email: config.devEmail }
  }

  const token = accessToken(request)
  if (!token || !config.teamDomain || !config.audience) return null

  try {
    const { payload } = await jwtVerify(
      token,
      getKey ?? keySetFor(config.teamDomain),
      {
        issuer: `https://${config.teamDomain}`,
        audience: config.audience,
        algorithms: ['RS256'],
      },
    )
    return typeof payload.email === 'string' && payload.email
      ? { email: payload.email }
      : null
  } catch {
    return null
  }
}
