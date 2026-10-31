# Changelog

All notable changes are listed here, newest first. Versions follow semver.

## Unreleased

### Added

- Exchange rates are stored in `exchange_rates` and refreshed by the daily job and when settings are saved. If Frankfurter is down, the stored rates are used.
- A quote keeps the currency and rate the client chose in the calculator (`quotes.display_currency`, `quotes.display_rate`). The public quote page and the quote emails show amounts in that currency, with the base total beside it.
- Admins can create quotes at `/admin/quotes/new`, with an optional client picker, items, discount and an internal note. The quote starts as `new` and is sent from its detail page.
- `quotes.source` records whether a quote came from the calculator or the admin, and the activity log shows `Created by you` for admin quotes.

### Changed

- The dashboard's new quote requests leave out quotes the admin created.

## 1.5.0 - 2026-10-30

Commits `bb1b3bd` to `cca2f54`.

### Added

- Notes field on invoices.
- Payment link field on invoices.
- Private flag on services and packages.
- Approved currencies and exchange rates.
- Multi-select component and its registry dependencies.

### Changed

- The admin settings form marks required fields.

## 1.4.0 - 2026-10-29

Commits `329bf7a` to `df80fde`.

### Added

- R2 bucket binding for logo uploads. R2 is optional in the docs.
- Customizable calculator title and description in settings.

### Changed

- Invoices read payment terms from settings.
- SVG logo uploads are sanitized, and server error handling is stricter.
- `keep_vars` moved into the wrangler config.
- Class names use the `cn` utility.

## 1.3.0 - 2026-10-28

Commits `ec52b63` to `233bb6d`.

### Added

- Charts on the admin overview, built with recharts.
- Site icons, logos, and a web manifest.
- Security policy and HTTP security headers.
- Rate limiting and further security hardening.
- Categories for packages, and a category filter in the calculator steps.
- Recurring schedule creation from quotes.
- Cloudflare Access logout button in the admin.
- Branding and a deploy-to-Cloudflare button.
- Project guide and updated setup docs.

### Changed

- Personal configuration moved out of the repo, leaving generic config files (PR #1).
- `db:seed` only seeds the service catalogue.
- Email templates share one layout component.
- Route components are inlined for colocation, and the admin layout and sidebar are simpler.
- Unused dependencies and internal exports were removed.
- Dev tools are hidden in the admin sidebar in development mode.

### Fixed

- The deploy script no longer passes a redundant wrangler config flag.

## 1.2.0 - 2026-10-27

Commits `1394b4b` to `027972b`.

### Added

- Automated invoice reminder emails and a daily job that marks overdue invoices.
- Recurring invoices and schedules.
- Package management and a package selection step in the calculator.
- Single quantity mode for services.
- Public API and Resend webhook endpoints.
- Bank details in settings and on invoices.
- Advance payments on invoices.
- Admin dashboard overview page.
- Toast notifications with sonner.
- Review quote button in the calculator summary.
- Confirmation dialog for destructive actions.
- Dynamic branding in the site header.

### Changed

- Error handling, validation, and request limits are stricter.
- Server actions share a helper for error handling.
- The custom price override and options steps were removed from the calculator.
- The custom container component was replaced with the Tailwind container utility.

### Fixed

- Invoice form state resets after saving an existing invoice.

## 1.1.0 - 2026-10-27

Commits `f2d21e0` to `bb6c5b5`.

### Added

- Quote requests and quote management.
- Client management in the admin panel.
- Admin invoice list and creation UI.
- Public invoice links and status transitions.
- Quote to invoice conversion.
- Invoice emails sent through the Resend API.
- Customizable invoice email templates.
- Back buttons and dynamic breadcrumbs on admin pages.
- Print styles.
- Turnstile site key in the wrangler config.

### Changed

- Admin lists use the data table component.
- Action buttons use ButtonGroup.
- The application was renamed from QuoteKit to Quoteflare.
- Form layouts have more spacing, and the codebase was reformatted.

### Removed

- The unused `cn` package.

## 1.0.0 - 2026-10-27

Commits `1b9fc61` to `f09f046`.

### Added

- TanStack Start project on Cloudflare Workers.
- Drizzle ORM schema and database migrations.
- Cloudflare Access authentication for admin routes.
- Business settings and logo upload.
- Admin dashboard layout and navigation.
- Services and categories management.
- Pricing calculation and validation module.
- Price calculator with its routes and seed data.
- Remote service import script.
- Data table component.

### Changed

- Currency set to LKR.
- Header, step navigation, theme toggle, and fonts were updated.
