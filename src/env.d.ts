// Vars set in the Cloudflare dashboard. They are not in wrangler.toml, so
// `wrangler types` does not generate them. Both declarations are needed
// because the generated global Env does not extend Cloudflare.Env.
declare namespace Cloudflare {
  interface Env {
    ACCESS_TEAM_DOMAIN: string
    TURNSTILE_SITE_KEY: string
    EMAIL_FROM: string
    APP_ORIGIN: string
    ALLOWED_ORIGINS: string
  }
}

interface Env {
  ACCESS_TEAM_DOMAIN: string
  TURNSTILE_SITE_KEY: string
  EMAIL_FROM: string
  APP_ORIGIN: string
  ALLOWED_ORIGINS: string
}
