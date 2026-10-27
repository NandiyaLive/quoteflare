CREATE TABLE `package_items` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`service_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`option_ids` text DEFAULT '[]' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "package_items_quantity_positive" CHECK("package_items"."quantity" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `package_items_pair_idx` ON `package_items` (`package_id`,`service_id`);--> statement-breakpoint
CREATE TABLE `packages` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `packages_active_sort_idx` ON `packages` (`active`,`sort_order`);