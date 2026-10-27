ALTER TABLE `quotes` ADD `message` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `breakdown` text;--> statement-breakpoint
ALTER TABLE `quotes` ADD `currency` text DEFAULT 'LKR' NOT NULL;