insert or ignore into settings (id, business_name, address, email, currency, tax_rate_bps, invoice_prefix, next_invoice_number, payment_instructions)
values ('main', 'Quoteflare Studio', '12 Example Street, Colombo', 'billing@example.com', 'LKR', 1000, 'INV', 2, 'Bank transfer to the account listed on your invoice.');

insert or ignore into clients (id, name, company, email, address, notes, archived) values
  ('gkkxqliw9j8wo4ghgpjspx26', 'Jane Perera', 'Acme Ltd', 'jane@acme.example', '1 Acme Road, Colombo', '', 0),
  ('jxjiv9of4j1j5siep2b0m6g9', 'Kamal Silva', 'Globex', 'kamal@globex.example', '5 Globex Lane, Kandy', 'Prefers email', 0);

insert or ignore into invoices (id, number, client_id, status, issue_date, due_date, currency, tax_rate_bps, discount)
values ('oc9rpkzhcuitbephoske0iri', 'INV-2026-0001', 'gkkxqliw9j8wo4ghgpjspx26', 'draft', '2026-01-15', '2026-01-29', 'LKR', 1000, 0);

insert or ignore into invoice_items (id, invoice_id, description, quantity, unit_price, sort_order) values
  ('uspmfw5gvrfhos84lt63m1sy', 'oc9rpkzhcuitbephoske0iri', 'Home page', 1, 4500000, 0),
  ('ct5j4anvbzeemdhx85du3x91', 'oc9rpkzhcuitbephoske0iri', 'Additional page', 2, 1500000, 1);
