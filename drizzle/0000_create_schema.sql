CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `clients_email_idx` ON `clients` (`email`);--> statement-breakpoint
CREATE TABLE `email_log` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text,
	`type` text NOT NULL,
	`to_address` text NOT NULL,
	`status` text NOT NULL,
	`provider_id` text,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "email_log_status" CHECK(status in ('pending', 'sent', 'failed', 'delivered', 'bounced', 'complained'))
);
--> statement-breakpoint
CREATE INDEX `email_log_invoice_type_idx` ON `email_log` (`invoice_id`,`type`);--> statement-breakpoint
CREATE INDEX `email_log_provider_idx` ON `email_log` (`provider_id`);--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "invoice_items_quantity_positive" CHECK("invoice_items"."quantity" >= 1)
);
--> statement-breakpoint
CREATE INDEX `invoice_items_invoice_idx` ON `invoice_items` (`invoice_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`client_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`issue_date` text NOT NULL,
	`due_date` text NOT NULL,
	`currency` text NOT NULL,
	`tax_rate_bps` integer DEFAULT 0 NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`public_token` text,
	`sent_at` text,
	`last_reminder_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invoices_status" CHECK(status in ('draft', 'sent', 'paid', 'overdue', 'void')),
	CONSTRAINT "invoices_tax_rate_range" CHECK("invoices"."tax_rate_bps" between 0 and 10000),
	CONSTRAINT "invoices_discount_nonneg" CHECK("invoices"."discount" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_number_unique` ON `invoices` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_public_token_unique` ON `invoices` (`public_token`);--> statement-breakpoint
CREATE INDEX `invoices_client_idx` ON `invoices` (`client_id`);--> statement-breakpoint
CREATE INDEX `invoices_status_due_idx` ON `invoices` (`status`,`due_date`);--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_name` text NOT NULL,
	`contact_email` text NOT NULL,
	`selection` text NOT NULL,
	`total` integer NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "quotes_status" CHECK(status in ('new', 'converted', 'dismissed'))
);
--> statement-breakpoint
CREATE INDEX `quotes_status_idx` ON `quotes` (`status`);--> statement-breakpoint
CREATE TABLE `recurring_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`items` text NOT NULL,
	`interval` text NOT NULL,
	`next_run_date` text NOT NULL,
	`auto_send` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recurring_interval" CHECK(interval in ('weekly', 'monthly', 'quarterly', 'yearly'))
);
--> statement-breakpoint
CREATE INDEX `recurring_active_next_idx` ON `recurring_schedules` (`active`,`next_run_date`);--> statement-breakpoint
CREATE TABLE `service_options` (
	`id` text PRIMARY KEY NOT NULL,
	`service_id` text NOT NULL,
	`name` text NOT NULL,
	`modifier_type` text NOT NULL,
	`modifier_value` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "service_options_type" CHECK(modifier_type in ('flat', 'percent'))
);
--> statement-breakpoint
CREATE INDEX `service_options_service_idx` ON `service_options` (`service_id`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`unit_label` text DEFAULT 'unit' NOT NULL,
	`unit_price` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "services_unit_price_nonneg" CHECK("services"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE INDEX `services_active_sort_idx` ON `services` (`active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY DEFAULT 'main' NOT NULL,
	`business_name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`tax_rate_bps` integer DEFAULT 0 NOT NULL,
	`invoice_prefix` text DEFAULT 'INV' NOT NULL,
	`next_invoice_number` integer DEFAULT 1 NOT NULL,
	`payment_instructions` text DEFAULT '' NOT NULL,
	`logo_key` text,
	CONSTRAINT "settings_single_row" CHECK("settings"."id" = 'main'),
	CONSTRAINT "settings_tax_rate_range" CHECK("settings"."tax_rate_bps" between 0 and 10000),
	CONSTRAINT "settings_next_number_positive" CHECK("settings"."next_invoice_number" >= 1)
);
