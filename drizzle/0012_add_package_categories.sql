CREATE TABLE `package_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `packages` ADD `category_id` text REFERENCES package_categories(id);--> statement-breakpoint
CREATE INDEX `packages_category_idx` ON `packages` (`category_id`);