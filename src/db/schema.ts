import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { createId } from '#/lib/id'
import type { PricingBreakdown } from '#/lib/pricing'

// Money is stored in minor units (cents). Tax rates and percentage price
// modifiers are stored in basis points (1500 = 15%). Dates are `YYYY-MM-DD`
// text and timestamps are UTC ISO 8601 text.

export const invoiceStatuses = [
  'draft',
  'sent',
  'paid',
  'overdue',
  'void',
] as const
export const quoteStatuses = ['new', 'converted', 'dismissed'] as const
export const modifierTypes = ['flat', 'percent'] as const
export const recurringIntervals = [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
] as const
export const pricingModes = ['fixed', 'custom'] as const
export const serviceBillings = [
  'one_time',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
] as const
export const optionSelections = ['single', 'multiple'] as const
export const emailStatuses = [
  'pending',
  'sent',
  'failed',
  'delivered',
  'bounced',
  'complained',
] as const

export type InvoiceStatus = (typeof invoiceStatuses)[number]
export type QuoteStatus = (typeof quoteStatuses)[number]
export type ModifierType = (typeof modifierTypes)[number]
export type RecurringInterval = (typeof recurringIntervals)[number]
export type PricingMode = (typeof pricingModes)[number]
export type ServiceBilling = (typeof serviceBillings)[number]
export type OptionSelection = (typeof optionSelections)[number]
export type EmailStatus = (typeof emailStatuses)[number]

export type QuoteSelection = {
  serviceId: string
  quantity: number
  optionIds: string[]
  priceOverride?: number
}[]

export type RecurringItem = {
  description: string
  quantity: number
  unitPrice: number
}

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => createId())

const createdAt = () =>
  text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)

const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} in (${values.map((v) => `'${v}'`).join(', ')})`)

export const settings = sqliteTable(
  'settings',
  {
    id: text('id').primaryKey().default('main'),
    businessName: text('business_name').notNull(),
    address: text('address').notNull().default(''),
    email: text('email').notNull().default(''),
    replyToEmail: text('reply_to_email').notNull().default(''),
    currency: text('currency').notNull().default('USD'),
    taxRateBps: integer('tax_rate_bps').notNull().default(0),
    invoicePrefix: text('invoice_prefix').notNull().default('INV'),
    nextInvoiceNumber: integer('next_invoice_number').notNull().default(1),
    paymentInstructions: text('payment_instructions').notNull().default(''),
    logoKey: text('logo_key'),
  },
  (t) => [
    check('settings_single_row', sql`${t.id} = 'main'`),
    check('settings_tax_rate_range', sql`${t.taxRateBps} between 0 and 10000`),
    check('settings_next_number_positive', sql`${t.nextInvoiceNumber} >= 1`),
  ],
)

export const serviceCategories = sqliteTable('service_categories', {
  id: id(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
})

// `unitPrice` is the price for `fixed` services and only a default for
// `custom` ones. The new columns carry no table-level checks because SQLite
// would have to rebuild the table to add them, so Zod enforces their ranges.
export const services = sqliteTable(
  'services',
  {
    id: id(),
    categoryId: text('category_id').references(() => serviceCategories.id),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    note: text('note').notNull().default(''),
    unitLabel: text('unit_label').notNull().default('unit'),
    unitPrice: integer('unit_price').notNull(),
    pricingMode: text('pricing_mode', { enum: pricingModes })
      .notNull()
      .default('fixed'),
    billing: text('billing', { enum: serviceBillings })
      .notNull()
      .default('one_time'),
    minQuantity: integer('min_quantity').notNull().default(1),
    maxQuantity: integer('max_quantity'),
    quantityStep: integer('quantity_step').notNull().default(1),
    taxable: integer('taxable', { mode: 'boolean' }).notNull().default(true),
    estimatedDaysMin: real('estimated_days_min'),
    estimatedDaysMax: real('estimated_days_max'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    check('services_unit_price_nonneg', sql`${t.unitPrice} >= 0`),
    index('services_active_sort_idx').on(t.active, t.sortOrder),
    index('services_category_idx').on(t.categoryId),
  ],
)

export const serviceOptionGroups = sqliteTable(
  'service_option_groups',
  {
    id: id(),
    serviceId: text('service_id')
      .notNull()
      .references(() => services.id),
    name: text('name').notNull(),
    selection: text('selection', { enum: optionSelections })
      .notNull()
      .default('multiple'),
    required: integer('required', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('service_option_groups_service_idx').on(t.serviceId)],
)

export const serviceOptions = sqliteTable(
  'service_options',
  {
    id: id(),
    serviceId: text('service_id')
      .notNull()
      .references(() => services.id),
    groupId: text('group_id').references(() => serviceOptionGroups.id),
    name: text('name').notNull(),
    modifierType: text('modifier_type', { enum: modifierTypes }).notNull(),
    modifierValue: integer('modifier_value').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [
    check('service_options_type', inList('modifier_type', modifierTypes)),
    index('service_options_service_idx').on(t.serviceId),
  ],
)

export const serviceDependencies = sqliteTable(
  'service_dependencies',
  {
    id: id(),
    serviceId: text('service_id')
      .notNull()
      .references(() => services.id),
    requiredServiceId: text('required_service_id')
      .notNull()
      .references(() => services.id),
  },
  (t) => [
    check(
      'service_dependencies_not_self',
      sql`${t.serviceId} <> ${t.requiredServiceId}`,
    ),
    uniqueIndex('service_dependencies_pair_idx').on(
      t.serviceId,
      t.requiredServiceId,
    ),
  ],
)

export const clients = sqliteTable(
  'clients',
  {
    id: id(),
    name: text('name').notNull(),
    company: text('company').notNull().default(''),
    email: text('email').notNull().default(''),
    address: text('address').notNull().default(''),
    notes: text('notes').notNull().default(''),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('clients_email_idx').on(t.email)],
)

export const quotes = sqliteTable(
  'quotes',
  {
    id: id(),
    contactName: text('contact_name').notNull(),
    contactEmail: text('contact_email').notNull(),
    message: text('message').notNull().default(''),
    selection: text('selection', { mode: 'json' })
      .$type<QuoteSelection>()
      .notNull(),
    breakdown: text('breakdown', { mode: 'json' }).$type<PricingBreakdown>(),
    currency: text('currency').notNull().default('LKR'),
    total: integer('total').notNull(),
    status: text('status', { enum: quoteStatuses }).notNull().default('new'),
    createdAt: createdAt(),
  },
  (t) => [
    check('quotes_status', inList('status', quoteStatuses)),
    index('quotes_status_idx').on(t.status),
  ],
)

export const invoices = sqliteTable(
  'invoices',
  {
    id: id(),
    number: text('number').notNull().unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    status: text('status', { enum: invoiceStatuses })
      .notNull()
      .default('draft'),
    issueDate: text('issue_date').notNull(),
    dueDate: text('due_date').notNull(),
    currency: text('currency').notNull(),
    taxRateBps: integer('tax_rate_bps').notNull().default(0),
    discount: integer('discount').notNull().default(0),
    publicToken: text('public_token').unique(),
    sourceQuoteId: text('source_quote_id')
      .unique()
      .references(() => quotes.id),
    sentAt: text('sent_at'),
    lastReminderAt: text('last_reminder_at'),
    createdAt: createdAt(),
  },
  (t) => [
    check('invoices_status', inList('status', invoiceStatuses)),
    check('invoices_tax_rate_range', sql`${t.taxRateBps} between 0 and 10000`),
    check('invoices_discount_nonneg', sql`${t.discount} >= 0`),
    index('invoices_client_idx').on(t.clientId),
    index('invoices_status_due_idx').on(t.status, t.dueDate),
  ],
)

export const invoiceItems = sqliteTable(
  'invoice_items',
  {
    id: id(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull(),
    unitPrice: integer('unit_price').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    taxable: integer('taxable', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [
    check('invoice_items_quantity_positive', sql`${t.quantity} >= 1`),
    index('invoice_items_invoice_idx').on(t.invoiceId, t.sortOrder),
  ],
)

export const recurringSchedules = sqliteTable(
  'recurring_schedules',
  {
    id: id(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    items: text('items', { mode: 'json' }).$type<RecurringItem[]>().notNull(),
    interval: text('interval', { enum: recurringIntervals }).notNull(),
    nextRunDate: text('next_run_date').notNull(),
    autoSend: integer('auto_send', { mode: 'boolean' })
      .notNull()
      .default(false),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [
    check('recurring_interval', inList('interval', recurringIntervals)),
    index('recurring_active_next_idx').on(t.active, t.nextRunDate),
  ],
)

export const emailLog = sqliteTable(
  'email_log',
  {
    id: id(),
    invoiceId: text('invoice_id').references(() => invoices.id, {
      onDelete: 'set null',
    }),
    type: text('type').notNull(),
    toAddress: text('to_address').notNull(),
    status: text('status', { enum: emailStatuses }).notNull(),
    providerId: text('provider_id'),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [
    check('email_log_status', inList('status', emailStatuses)),
    index('email_log_invoice_type_idx').on(t.invoiceId, t.type),
    index('email_log_provider_idx').on(t.providerId),
  ],
)
