import { readFileSync } from 'node:fs'
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
