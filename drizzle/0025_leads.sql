CREATE TABLE `lead_events` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`type` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "lead_events_type" CHECK(type in ('saved', 'messaged', 'checked_unseen', 'checked_seen', 'followed_up', 'replied', 'rescheduled', 'won', 'closed', 'reopened', 'note'))
);
--> statement-breakpoint
CREATE INDEX `lead_events_lead_idx` ON `lead_events` (`lead_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`handle` text NOT NULL,
	`profile_url` text NOT NULL,
	`profile_key` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'saved' NOT NULL,
	`next_action_on` text,
	`follow_ups` integer DEFAULT 0 NOT NULL,
	`unseen_checks` integer DEFAULT 0 NOT NULL,
	`last_contacted_at` text,
	`close_reason` text,
	`client_id` text,
	`quote_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "leads_platform" CHECK(platform in ('instagram', 'facebook', 'tiktok', 'linkedin', 'x', 'whatsapp', 'other')),
	CONSTRAINT "leads_status" CHECK(status in ('saved', 'messaged', 'seen', 'replied', 'won', 'closed')),
	CONSTRAINT "leads_close_reason" CHECK("leads"."close_reason" is null or close_reason in ('no_reply', 'not_interested', 'bad_fit', 'other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leads_profile_key_unique` ON `leads` (`profile_key`);--> statement-breakpoint
CREATE INDEX `leads_status_next_idx` ON `leads` (`status`,`next_action_on`);--> statement-breakpoint
ALTER TABLE `settings` ADD `lead_opener_template` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `lead_follow_up_template` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `lead_max_follow_ups` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `send_lead_digest` integer DEFAULT true NOT NULL;