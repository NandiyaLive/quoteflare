ALTER TABLE `settings` ADD `invoice_email_subject` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `invoice_email_body` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `invoice_email_button` text DEFAULT '' NOT NULL;