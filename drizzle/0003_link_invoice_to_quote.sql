ALTER TABLE `invoices` ADD `source_quote_id` text REFERENCES quotes(id);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_source_quote_id_unique` ON `invoices` (`source_quote_id`);