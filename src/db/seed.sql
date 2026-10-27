insert or ignore into settings (id, business_name, address, email, currency, tax_rate_bps, invoice_prefix, next_invoice_number, payment_instructions)
values ('main', 'QuoteKit', '12 Example Street, Colombo', 'billing@example.com', 'USD', 1000, 'INV', 2, 'Bank transfer to the account listed on your invoice.');

insert or ignore into services (id, name, description, unit_label, unit_price, active, sort_order) values
  ('uevhys06ewcyw12ci7kcpdwg', 'Logo design', 'Custom logo with two revision rounds', 'project', 45000, 1, 0),
  ('y0v04akpl4sznb0vbta32eoa', 'Web development', 'Hourly development work', 'hour', 6000, 1, 1),
  ('dxz0hb7o2e9b72xmgzicurs7', 'Copywriting', 'Marketing copy per page', 'page', 8000, 1, 2);

insert or ignore into service_options (id, service_id, name, modifier_type, modifier_value, active) values
  ('ancnhj49bkpnum4h8dkckgds', 'y0v04akpl4sznb0vbta32eoa', 'Rush delivery', 'percent', 2500, 1),
  ('e72fsbrk6zimhdykp842ucaj', 'uevhys06ewcyw12ci7kcpdwg', 'Source files', 'flat', 5000, 1);

insert or ignore into clients (id, name, company, email, address, notes, archived) values
  ('gkkxqliw9j8wo4ghgpjspx26', 'Jane Perera', 'Acme Ltd', 'jane@acme.example', '1 Acme Road, Colombo', '', 0),
  ('jxjiv9of4j1j5siep2b0m6g9', 'Kamal Silva', 'Globex', 'kamal@globex.example', '5 Globex Lane, Kandy', 'Prefers email', 0);

insert or ignore into invoices (id, number, client_id, status, issue_date, due_date, currency, tax_rate_bps, discount)
values ('oc9rpkzhcuitbephoske0iri', 'INV-2026-0001', 'gkkxqliw9j8wo4ghgpjspx26', 'draft', '2026-01-15', '2026-01-29', 'USD', 1000, 0);

insert or ignore into invoice_items (id, invoice_id, description, quantity, unit_price, sort_order) values
  ('uspmfw5gvrfhos84lt63m1sy', 'oc9rpkzhcuitbephoske0iri', 'Logo design', 1, 45000, 0),
  ('ct5j4anvbzeemdhx85du3x91', 'oc9rpkzhcuitbephoske0iri', 'Web development', 10, 6000, 1);
