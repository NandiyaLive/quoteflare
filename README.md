<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/logo-light.svg">
  <img src="public/logo.svg" alt="Quoteflare" width="360">
</picture>

<p><strong>Quotes and invoices for a one-person business, running on Cloudflare's free tier.</strong></p>

</div>

Quoteflare is a self-hosted invoicing app for a single owner. Visitors build a quote with a public pricing calculator. You turn the quote into an invoice, email it to the client, and let the app chase late payments. It runs as one Cloudflare Worker with a D1 database and an R2 bucket, so a small business can host it without paying for servers.

It does not take payments. Invoices carry a status that you set yourself.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/NandiyaLive/quoteflare)

## Features

- **Pricing calculator.** A public page where a visitor picks services, options and quantities. The server recomputes the total from current prices, so the client cannot change it. Turnstile guards the submit.
- **Service catalogue.** Categories, fixed or custom pricing, weekly to yearly billing, option groups, required services and packages. Import a catalogue from JSON.
- **Quotes to invoices.** Convert a submitted quote into an invoice. Invoice numbers follow `<prefix>-YYYY-NNNN`, and the prefix defaults to `INV`. Advance payments are supported.
- **Email through Resend.** Send an invoice with a link to a public page at `/i/<token>`. A webhook records delivery, bounces and complaints.
- **Reminders.** A daily cron job marks unpaid invoices overdue. It also emails clients before and after an invoice is due, which is off by default.
- **Recurring invoices.** Schedules create, and optionally send, invoices weekly, monthly, quarterly or yearly.
- **Admin dashboard.** Clients, services, packages, quotes, invoices, schedules and business settings, behind Cloudflare Access.

## Tech stack

| Area         | Choice                                                         |
| ------------ | -------------------------------------------------------------- |
| Framework    | TanStack Start, TanStack Router, React 19                      |
| Runtime      | Cloudflare Workers                                             |
| Database     | Cloudflare D1 with Drizzle ORM                                 |
| File storage | Cloudflare R2                                                  |
| API          | Hono, mounted at `/api`                                        |
| Email        | Resend, rendered with React Email                              |
| Auth         | Cloudflare Access (one-time PIN), verified again in the Worker |
| UI           | Tailwind CSS 4, shadcn/ui on Base UI                           |
| Tests        | Vitest                                                         |

## Getting started

You need Node.js 22.12 or newer and [Bun](https://bun.sh).

```bash
git clone https://github.com/NandiyaLive/quoteflare.git
cd quoteflare
bun install
cp .dev.vars.example .dev.vars
bun run db:migrate:local
bun run db:seed
bun run dev
```

The app runs at http://localhost:3000, and `/admin` accepts the identity in `ACCESS_DEV_EMAIL` when the host is `localhost`. Use `bun run dev`, not `bun --bun run dev`, which breaks the Cloudflare plugin.

The `.dev.vars.example` file uses Cloudflare's always-pass Turnstile test keys. Add a `RESEND_API_KEY` to send real email.

## Scripts

| Command                                 | What it does                             |
| --------------------------------------- | ---------------------------------------- |
| `bun run dev`                           | Start the dev server                     |
| `bun run build`                         | Build for production                     |
| `bun run deploy`                        | Build and deploy with Wrangler           |
| `bun run test`                          | Run the Vitest suite                     |
| `bun run lint` / `typecheck` / `format` | ESLint, `tsc --noEmit` and Prettier      |
| `bun run db:generate`                   | Write a migration after a schema change  |
| `bun run db:migrate:local` / `:remote`  | Apply migrations                         |
| `bun run db:seed`                       | Load sample data locally                 |
| `bun run db:export`                     | Export the remote database to `backups/` |

## Deploying

### One click

The button above copies the repository to your GitHub account, creates the D1 database and R2 bucket, and deploys the Worker to `workers.dev`. It asks for the secrets listed in `.dev.vars.example`. Afterwards:

1. Run `bunx wrangler d1 migrations apply DB --remote` from a clone of your copy.
2. Set the vars in `wrangler.toml` (`ACCESS_TEAM_DOMAIN`, `TURNSTILE_SITE_KEY`, `EMAIL_FROM`, `APP_ORIGIN` and `ALLOWED_ORIGINS`) and push.
3. Create a Cloudflare Access application for `/admin/*` with one allow policy for your email, then set `ACCESS_AUD` to its audience tag.

Until step 3 is done, `/admin` rejects every request.

### By hand

1. Sign in with `bunx wrangler login`.
2. Create the D1 database and the R2 bucket, then put the database ID in `wrangler.toml`. The repository's own deployment uses `wrangler.production.toml` and `bun run deploy:production`.
3. Edit the `[vars]` block and the route in `wrangler.toml` for your own domain.
4. Apply migrations with `bun run db:migrate:remote`.
5. Set the secrets `ACCESS_AUD`, `TURNSTILE_SECRET`, `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` with `bunx wrangler secret put <name>`.
6. Create a Cloudflare Access application for `/admin/*` with one allow policy for your email.
7. Deploy with `bun run deploy`.

The [guide](docs/guide.md) covers each step in detail, along with email setup, the webhook, backups and free plan limits.

## Project layout

```
src/
  api/        Hono app: Resend webhook and public JSON endpoints
  components/ Shared UI
  db/         Drizzle schema, seed data and tests
  emails/     React Email templates
  jobs/       Daily cron: overdue marking, reminders and recurring invoices
  lib/        Shared helpers
  routes/     File-based routes: calculator, /admin, /i/<token>
  server/     Server-only code and server functions
drizzle/      Generated migrations
scripts/      Service catalogue importer
```

## Documentation

- [Guide](docs/guide.md): setup, services, email, recurring invoices, the HTTP API, backups and limits.

## Contributing

Issues and pull requests are welcome. Before you open a pull request, run:

```bash
bun run lint && bun run typecheck && bun run test
```

Money is stored in cents and percentages in basis points. Database IDs come from `createId` in `src/lib/id.ts`. The guide explains both.

## License

Quoteflare is released under the [MIT License](LICENSE).
