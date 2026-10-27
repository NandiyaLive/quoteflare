# QuoteKit

A single-user invoicing platform on Cloudflare's free tier. It has a public pricing calculator, a private dashboard for services, clients and invoices, email through Resend, and scheduled jobs. It has no payment gateways.

## Business decisions

| Setting | Value |
|---|---|
| Business name | QuoteKit |
| Default currency | USD |
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
