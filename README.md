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
