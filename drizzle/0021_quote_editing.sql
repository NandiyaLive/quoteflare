CREATE TABLE `quote_events` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_id` text NOT NULL,
	`type` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "quote_events_type" CHECK(type in ('received', 'edited', 'sent', 'reminded', 'accepted', 'declined', 'expired', 'dismissed', 'reopened', 'converted'))
);
--> statement-breakpoint
CREATE INDEX `quote_events_quote_idx` ON `quote_events` (`quote_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `quotes` ADD `tax_rate_bps` integer;--> statement-breakpoint
ALTER TABLE `quotes` ADD `admin_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
INSERT INTO `quote_events` (`id`, `quote_id`, `type`, `created_at`) SELECT lower(hex(randomblob(12))), `id`, 'received', `created_at` FROM `quotes`;--> statement-breakpoint
INSERT INTO `quote_events` (`id`, `quote_id`, `type`, `created_at`) SELECT lower(hex(randomblob(12))), `id`, 'sent', `sent_at` FROM `quotes` WHERE `sent_at` IS NOT NULL;--> statement-breakpoint
INSERT INTO `quote_events` (`id`, `quote_id`, `type`, `created_at`) SELECT lower(hex(randomblob(12))), `id`, `status`, `responded_at` FROM `quotes` WHERE `responded_at` IS NOT NULL AND `status` IN ('accepted', 'declined');
