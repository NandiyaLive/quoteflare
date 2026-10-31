import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createId } from '#/lib/id'

const migrationsDir = join(import.meta.dirname, '../../drizzle')

let mf: Miniflare
let d1: D1Database

const apply = async (file: string) => {
  const statements = readFileSync(join(migrationsDir, file), 'utf8')
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean)
  await d1.batch(statements.map((s) => d1.prepare(s)))
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response(null) } }',
    d1Databases: { DB: createId() },
  })
  d1 = await mf.getD1Database('DB')
})

afterAll(() => mf.dispose())

describe('extending an existing database', () => {
  it('keeps services and options and fills the new columns with defaults', async () => {
    await apply('0000_create_schema.sql')
    const serviceId = createId()
    const optionId = createId()
    await d1.batch([
      d1
        .prepare(
          'insert into services (id, name, unit_price, sort_order) values (?, ?, ?, ?)',
        )
        .bind(serviceId, 'Existing', 4999, 0),
      d1
        .prepare(
          "insert into service_options (id, service_id, name, modifier_type, modifier_value) values (?, ?, 'Opt', 'flat', 500)",
        )
        .bind(optionId, serviceId),
    ])

    await apply('0001_extend_services.sql')

    const service = await d1
      .prepare('select * from services where id = ?')
      .bind(serviceId)
      .first()
    expect(service).toMatchObject({
      name: 'Existing',
      unit_price: 4999,
      category_id: null,
      note: '',
      pricing_mode: 'fixed',
      billing: 'one_time',
      min_quantity: 1,
      max_quantity: null,
      quantity_step: 1,
      taxable: 1,
      estimated_days_min: null,
      estimated_days_max: null,
    })
    const option = await d1
      .prepare('select * from service_options where id = ?')
      .bind(optionId)
      .first()
    expect(option).toMatchObject({ name: 'Opt', group_id: null, active: 1 })
  })
})

describe('widening the quote statuses', () => {
  it('keeps quotes and the rows that reference them', async () => {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    const target = files.findIndex((f) => f.startsWith('0020_'))
    // 0000 to 0002 already ran in the first test's database, so use a new one.
    const fresh = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response(null) } }',
      d1Databases: { DB: createId() },
    })
    const db = await fresh.getD1Database('DB')
    const run = async (file: string) => {
      const statements = readFileSync(join(migrationsDir, file), 'utf8')
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean)
      await db.batch(statements.map((s) => db.prepare(s)))
    }
    for (const file of files.slice(0, target)) await run(file)

    const quoteId = createId()
    const clientId = createId()
    const invoiceId = createId()
    await db.batch([
      db
        .prepare(
          "insert into quotes (id, contact_name, contact_email, selection, total, status) values (?, 'Jo', 'jo@example.com', '[]', 100, 'converted')",
        )
        .bind(quoteId),
      db
        .prepare("insert into clients (id, name) values (?, 'Jo')")
        .bind(clientId),
      db
        .prepare(
          "insert into invoices (id, number, client_id, source_quote_id, issue_date, due_date, currency) values (?, 'INV-1', ?, ?, '2026-01-01', '2026-01-15', 'USD')",
        )
        .bind(invoiceId, clientId, quoteId),
      db
        .prepare(
          "insert into email_log (id, quote_id, type, to_address, status) values (?, ?, 'quote_confirmation', 'jo@example.com', 'sent')",
        )
        .bind(createId(), quoteId),
    ])

    await run(files[target])

    expect(
      await db
        .prepare('select * from quotes where id = ?')
        .bind(quoteId)
        .first(),
    ).toMatchObject({
      status: 'converted',
      number: null,
      public_token: null,
      valid_until: null,
    })
    expect(
      await db
        .prepare('select source_quote_id from invoices where id = ?')
        .bind(invoiceId)
        .first(),
    ).toEqual({ source_quote_id: quoteId })
    expect(
      await db
        .prepare('select count(*) as n from email_log where quote_id = ?')
        .bind(quoteId)
        .first(),
    ).toEqual({ n: 1 })
    await db
      .prepare("update quotes set status = 'accepted' where id = ?")
      .bind(quoteId)
      .run()
    await fresh.dispose()
  })
})

describe('adding the quote source', () => {
  it('marks existing quotes as calculator requests and accepts created events', async () => {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    const target = files.findIndex((f) => f.startsWith('0022_'))
    const fresh = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response(null) } }',
      d1Databases: { DB: createId() },
    })
    const db = await fresh.getD1Database('DB')
    const run = async (file: string) => {
      const statements = readFileSync(join(migrationsDir, file), 'utf8')
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean)
      await db.batch(statements.map((s) => db.prepare(s)))
    }
    for (const file of files.slice(0, target)) await run(file)

    const quoteId = createId()
    await db.batch([
      db
        .prepare(
          "insert into quotes (id, contact_name, contact_email, selection, total) values (?, 'Jo', 'jo@example.com', '[]', 100)",
        )
        .bind(quoteId),
      db
        .prepare(
          "insert into quote_events (id, quote_id, type) values (?, ?, 'received')",
        )
        .bind(createId(), quoteId),
    ])

    await run(files[target])

    expect(
      await db
        .prepare('select source from quotes where id = ?')
        .bind(quoteId)
        .first(),
    ).toEqual({ source: 'calculator' })
    expect(
      await db
        .prepare('select type from quote_events where quote_id = ?')
        .bind(quoteId)
        .all(),
    ).toMatchObject({ results: [{ type: 'received' }] })
    await db
      .prepare(
        "insert into quote_events (id, quote_id, type) values (?, ?, 'created')",
      )
      .bind(createId(), quoteId)
      .run()
    await expect(
      db
        .prepare("update quotes set source = 'other' where id = ?")
        .bind(quoteId)
        .run(),
    ).rejects.toThrow()
    await fresh.dispose()
  })
})
