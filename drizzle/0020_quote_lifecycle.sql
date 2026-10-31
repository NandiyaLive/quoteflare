-- SQLite cannot change a CHECK constraint in place, so the quotes table is
-- rebuilt. Dropping it while invoices and email_log still point at it fails
-- the foreign key check, so the links are parked and restored around the swap.
CREATE TABLE `__quote_links` (`kind` text NOT NULL, `row_id` text NOT NULL, `quote_id` text NOT NULL);--> statement-breakpoint
INSERT INTO `__quote_links` SELECT 'invoice', `id`, `source_quote_id` FROM `invoices` WHERE `source_quote_id` IS NOT NULL;--> statement-breakpoint
INSERT INTO `__quote_links` SELECT 'email', `id`, `quote_id` FROM `email_log` WHERE `quote_id` IS NOT NULL;--> statement-breakpoint
UPDATE `invoices` SET `source_quote_id` = NULL WHERE `source_quote_id` IS NOT NULL;--> statement-breakpoint
UPDATE `email_log` SET `quote_id` = NULL WHERE `quote_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text,
	`public_token` text,
	`valid_until` text,
	`sent_at` text,
	`responded_at` text,
	`contact_name` text NOT NULL,
	`contact_email` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`selection` text NOT NULL,
	`breakdown` text,
	`currency` text DEFAULT 'LKR' NOT NULL,
	`total` integer NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "quotes_status" CHECK(status in ('new', 'sent', 'accepted', 'declined', 'expired', 'converted', 'dismissed'))
);
--> statement-breakpoint
INSERT INTO `__new_quotes`("id", "number", "contact_name", "contact_email", "message", "selection", "breakdown", "currency", "total", "status", "created_at") SELECT "id", "number", "contact_name", "contact_email", "message", "selection", "breakdown", "currency", "total", "status", "created_at" FROM `quotes`;--> statement-breakpoint
DROP TABLE `quotes`;--> statement-breakpoint
ALTER TABLE `__new_quotes` RENAME TO `quotes`;--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_number_unique` ON `quotes` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_public_token_unique` ON `quotes` (`public_token`);--> statement-breakpoint
CREATE INDEX `quotes_status_idx` ON `quotes` (`status`);--> statement-breakpoint
ALTER TABLE `settings` ADD `quote_validity_days` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
UPDATE `invoices` SET `source_quote_id` = (SELECT `quote_id` FROM `__quote_links` WHERE `kind` = 'invoice' AND `row_id` = `invoices`.`id`) WHERE `id` IN (SELECT `row_id` FROM `__quote_links` WHERE `kind` = 'invoice');--> statement-breakpoint
UPDATE `email_log` SET `quote_id` = (SELECT `quote_id` FROM `__quote_links` WHERE `kind` = 'email' AND `row_id` = `email_log`.`id`) WHERE `id` IN (SELECT `row_id` FROM `__quote_links` WHERE `kind` = 'email');--> statement-breakpoint
DROP TABLE `__quote_links`;
