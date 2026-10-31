ALTER TABLE `email_log` ADD `quote_id` text REFERENCES quotes(id);--> statement-breakpoint
CREATE INDEX `email_log_quote_type_idx` ON `email_log` (`quote_id`,`type`);--> statement-breakpoint
ALTER TABLE `quotes` ADD `number` text;--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_number_unique` ON `quotes` (`number`);--> statement-breakpoint
ALTER TABLE `settings` ADD `next_quote_number` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
UPDATE `quotes` SET `number` = 'QUO-' || printf('%04d', (SELECT count(*) FROM `quotes` AS `q` WHERE `q`.`created_at` < `quotes`.`created_at` OR (`q`.`created_at` = `quotes`.`created_at` AND `q`.`id` <= `quotes`.`id`)));--> statement-breakpoint
UPDATE `settings` SET `next_quote_number` = (SELECT count(*) + 1 FROM `quotes`);
