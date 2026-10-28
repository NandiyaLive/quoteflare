insert or ignore into settings (id, business_name, address, email, currency, tax_rate_bps, invoice_prefix, next_invoice_number, payment_instructions)
values ('main', 'Quoteflare Studio', '12 Example Street, Springfield', 'billing@example.com', 'USD', 1000, 'INV', 2, 'Bank transfer to the account listed on your invoice.');

insert or ignore into clients (id, name, company, email, address, notes, archived) values
  ('gkkxqliw9j8wo4ghgpjspx26', 'Jane Smith', 'Acme Ltd', 'jane@acme.example', '1 Acme Road, Springfield', '', 0),
  ('jxjiv9of4j1j5siep2b0m6g9', 'Alex Rivera', 'Globex', 'alex@globex.example', '5 Globex Lane, Shelbyville', 'Prefers email', 0);

insert or ignore into invoices (id, number, client_id, status, issue_date, due_date, currency, tax_rate_bps, discount)
values ('oc9rpkzhcuitbephoske0iri', 'INV-2026-0001', 'gkkxqliw9j8wo4ghgpjspx26', 'draft', '2026-01-15', '2026-01-29', 'USD', 1000, 0);

insert or ignore into invoice_items (id, invoice_id, description, quantity, unit_price, sort_order) values
  ('uspmfw5gvrfhos84lt63m1sy', 'oc9rpkzhcuitbephoske0iri', 'Home page', 1, 60000, 0),
  ('ct5j4anvbzeemdhx85du3x91', 'oc9rpkzhcuitbephoske0iri', 'Additional page', 2, 20000, 1);
