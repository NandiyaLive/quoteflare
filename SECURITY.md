# Security policy

## Reporting a vulnerability

Report vulnerabilities privately through GitHub: open the repository's Security tab and choose "Report a vulnerability". Do not open a public issue for security problems.

Include the affected route or file, the steps to reproduce, and the impact you saw. You can expect a first reply within a week.

## Scope

Quoteflare is a self-hosted app for one owner. Reports about the code in this repository are in scope. Misconfiguration of your own Cloudflare account, Resend account or domain is not.

## Deployment checklist

- Set `ACCESS_AUD`, `TURNSTILE_SECRET`, `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` with `wrangler secret put`. Never commit them.
- Never set `ACCESS_DEV_EMAIL` in production. It grants admin access on `localhost` only, but it has no use outside local development.
- Cover `/admin/*` with a Cloudflare Access application and a single allow policy.
- Keep `workers_dev = false` so the Worker answers only on your own domain.
