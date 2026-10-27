CREATE TABLE `service_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `service_dependencies` (
	`id` text PRIMARY KEY NOT NULL,
	`service_id` text NOT NULL,
	`required_service_id` text NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`required_service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "service_dependencies_not_self" CHECK("service_dependencies"."service_id" <> "service_dependencies"."required_service_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_dependencies_pair_idx` ON `service_dependencies` (`service_id`,`required_service_id`);--> statement-breakpoint
CREATE TABLE `service_option_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`service_id` text NOT NULL,
	`name` text NOT NULL,
	`selection` text DEFAULT 'multiple' NOT NULL,
	`required` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `service_option_groups_service_idx` ON `service_option_groups` (`service_id`);--> statement-breakpoint
ALTER TABLE `service_options` ADD `group_id` text REFERENCES service_option_groups(id);--> statement-breakpoint
ALTER TABLE `services` ADD `category_id` text REFERENCES service_categories(id);--> statement-breakpoint
ALTER TABLE `services` ADD `note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `pricing_mode` text DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `billing` text DEFAULT 'one_time' NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `min_quantity` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `max_quantity` integer;--> statement-breakpoint
ALTER TABLE `services` ADD `quantity_step` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `taxable` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `estimated_days_min` real;--> statement-breakpoint
ALTER TABLE `services` ADD `estimated_days_max` real;--> statement-breakpoint
CREATE INDEX `services_category_idx` ON `services` (`category_id`);