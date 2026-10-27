insert or ignore into settings (id, business_name, address, email, currency, tax_rate_bps, invoice_prefix, next_invoice_number, payment_instructions)
values ('main', 'QuoteKit', '12 Example Street, Colombo', 'billing@example.com', 'USD', 1000, 'INV', 2, 'Bank transfer to the account listed on your invoice.');

insert or ignore into services (id, name, description, unit_label, unit_price, active, sort_order) values
  ('seed-service-design', 'Logo design', 'Custom logo with two revision rounds', 'project', 45000, 1, 0),
  ('seed-service-web', 'Web development', 'Hourly development work', 'hour', 6000, 1, 1),
  ('seed-service-copy', 'Copywriting', 'Marketing copy per page', 'page', 8000, 1, 2);

insert or ignore into service_options (id, service_id, name, modifier_type, modifier_value, active) values
  ('seed-option-rush', 'seed-service-web', 'Rush delivery', 'percent', 2500, 1),
  ('seed-option-source', 'seed-service-design', 'Source files', 'flat', 5000, 1);

insert or ignore into clients (id, name, company, email, address, notes, archived) values
  ('seed-client-acme', 'Jane Perera', 'Acme Ltd', 'jane@acme.example', '1 Acme Road, Colombo', '', 0),
  ('seed-client-globex', 'Kamal Silva', 'Globex', 'kamal@globex.example', '5 Globex Lane, Kandy', 'Prefers email', 0);

insert or ignore into invoices (id, number, client_id, status, issue_date, due_date, currency, tax_rate_bps, discount)
values ('seed-invoice-1', 'INV-2026-0001', 'seed-client-acme', 'draft', '2026-01-15', '2026-01-29', 'USD', 1000, 0);

insert or ignore into invoice_items (id, invoice_id, description, quantity, unit_price, sort_order) values
  ('seed-item-1', 'seed-invoice-1', 'Logo design', 1, 45000, 0),
  ('seed-item-2', 'seed-invoice-1', 'Web development', 10, 6000, 1);
