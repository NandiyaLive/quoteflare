import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { JWTVerifyGetKey } from 'jose'

export const ACCESS_JWT_HEADER = 'Cf-Access-Jwt-Assertion'

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

export async function authenticateAdmin(
  request: Request,
  config: AccessConfig,
  getKey?: JWTVerifyGetKey,
): Promise<AdminIdentity | null> {
  if (config.devEmail && LOCAL_HOSTS.has(new URL(request.url).hostname)) {
    return { email: config.devEmail }
  }

  const token = request.headers.get(ACCESS_JWT_HEADER)
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
