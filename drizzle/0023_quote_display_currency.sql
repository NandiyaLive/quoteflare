CREATE TABLE `exchange_rates` (
	`base` text NOT NULL,
	`quote` text NOT NULL,
	`rate` real NOT NULL,
	`fetched_at` text NOT NULL,
	PRIMARY KEY(`base`, `quote`)
);
--> statement-breakpoint
ALTER TABLE `quotes` ADD `display_currency` text;--> statement-breakpoint
ALTER TABLE `quotes` ADD `display_rate` real;