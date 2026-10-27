# QuoteKit

A single-user invoicing platform on Cloudflare's free tier. It has a public pricing calculator, a private dashboard for services, clients and invoices, email through Resend, and scheduled jobs. It has no payment gateways.

## Business decisions

| Setting               | Value                                        |
| --------------------- | -------------------------------------------- |
| Business name         | QuoteKit                                     |
| Default currency      | USD                                          |
| Invoice number format | `INV-YYYY-NNNN`, for example `INV-2026-0001` |

## Requirements

- Node.js 20 or newer
- [Bun](https://bun.sh)
- A Cloudflare account with the domain added to Cloudflare DNS
- A Resend account
- Wrangler, signed in with `bunx wrangler login`

Check the setup with:

```bash
node -v
bunx wrangler whoami
```

## Development

```bash
bun install
bun run dev
```

The dev server runs on http://localhost:3000. Run it with `bun run dev`, not `bun --bun run dev`, which breaks the Cloudflare plugin. Trigger the scheduled handler locally with:

```bash
curl "http://localhost:3000/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"
```

Other scripts: `bun run build`, `bun run deploy`, and `bun run cf-typegen` to regenerate `worker-configuration.d.ts` after editing `wrangler.toml`.

Checks: `bun run test` (Vitest), `bun run lint` (ESLint), `bun run typecheck` (tsc) and `bun run format` (Prettier).

## Project layout

Routes are directory based. Each route folder under `src/routes` owns its components, for example `src/routes/calculator/components/footer.tsx`. Any folder named `components` is skipped by the route generator (`routeFileIgnorePattern` in `vite.config.ts`). Components shared across routes go in `src/components/common`.

Other folders: `src/db` (Drizzle schema), `src/lib` (shared helpers), `src/server` (server-only code), `src/jobs` (scheduled jobs).

## Database

D1 (binding `DB`, database `quotekit`) is accessed through Drizzle. The schema lives in `src/db/schema.ts`. Money is stored in cents, tax rates and percentage price modifiers in basis points (1500 = 15%), and dates as ISO 8601 text.

```bash
bun run db:generate        # write a new migration to drizzle/ after editing the schema
bun run db:migrate:local   # apply migrations to the local database
bun run db:migrate:remote  # apply migrations to the remote database
bun run db:seed            # insert sample data locally (safe to run twice)
```

## UI components

The UI uses shadcn/ui on Base UI (`components.json`, preset `nova`). Add components with `bunx --bun shadcn@latest add <name>`; they land in `src/components/ui`. Custom components are written only when shadcn has no equivalent.

## Admin access

Everything under `/admin` sits behind Cloudflare Access (one-time PIN, one allowed email). The Worker also verifies the `Cf-Access-Jwt-Assertion` header on its own, so a request that skips Access still gets a 401. A request-level middleware (`src/start.ts`) guards every `/admin` path, and `requireAdmin` in `src/server/admin-middleware.ts` guards admin server functions. Declare admin server functions with `createServerFn().middleware([requireAdmin])` directly in the file that uses them, because the compiler only extracts handlers from literal `createServerFn` calls.

Configuration:

- `ACCESS_TEAM_DOMAIN` is a plain var in `wrangler.toml`.
- `ACCESS_AUD` is the Access application's audience tag. Set it with `bunx wrangler secret put ACCESS_AUD`.
- `ACCESS_DEV_EMAIL` is for local development only. Copy `.dev.vars.example` to `.dev.vars` and `/admin` accepts that identity, but only when the request host is `localhost`, `127.0.0.1` or `[::1]`. Never set it in production.

The Access application covers `invoices.neranjana.me/admin/*` with a single Allow policy for the owner's email and the One-time PIN login method. The Worker is attached to that hostname through `routes` in `wrangler.toml`.
