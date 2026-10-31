-- SQLite adds a column with a CHECK in place, so quotes is not rebuilt. The
-- invoices and email_log tables point at it, and a rebuild would need the
-- link parking that 0020 does. quote_events has no inbound references, so it
-- can be rebuilt to widen its type CHECK.
ALTER TABLE `quotes` ADD `source` text DEFAULT 'calculator' NOT NULL CONSTRAINT "quotes_source" CHECK(source in ('calculator', 'admin'));--> statement-breakpoint
CREATE TABLE `__new_quote_events` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_id` text NOT NULL,
	`type` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "quote_events_type" CHECK(type in ('received', 'created', 'edited', 'sent', 'reminded', 'accepted', 'declined', 'expired', 'dismissed', 'reopened', 'converted'))
);
--> statement-breakpoint
INSERT INTO `__new_quote_events`("id", "quote_id", "type", "detail", "created_at") SELECT "id", "quote_id", "type", "detail", "created_at" FROM `quote_events`;--> statement-breakpoint
DROP TABLE `quote_events`;--> statement-breakpoint
ALTER TABLE `__new_quote_events` RENAME TO `quote_events`;--> statement-breakpoint
CREATE INDEX `quote_events_quote_idx` ON `quote_events` (`quote_id`,`created_at`);
