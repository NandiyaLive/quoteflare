import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb, schema, type Db } from '#/db'
import { createTestD1 } from '#/db/test-db'
import { isCuid } from '#/lib/id'
import { ImportError, importServices } from './services-import'
import { listCategories, listServices } from './services'

let db: Db
let dispose: () => Promise<void>

beforeAll(async () => {
  const test = await createTestD1()
  db = createDb(test.d1)
  dispose = test.dispose
})

afterAll(() => dispose())

beforeEach(async () => {
  await db.delete(schema.serviceDependencies)
  await db.delete(schema.serviceOptions)
  await db.delete(schema.serviceOptionGroups)
  await db.delete(schema.services)
  await db.delete(schema.serviceCategories)
})

const example = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '../../scripts/services.example.json'),
    'utf8',
  ),
)

const rejects = async (input: unknown) => {
  const error = await importServices(db, input).catch((e: unknown) => e)
  expect(error).toBeInstanceOf(ImportError)
  expect(await db.select().from(schema.services)).toHaveLength(0)
  expect(await db.select().from(schema.serviceCategories)).toHaveLength(0)
  return (error as ImportError).message
}

describe('services import', () => {
  it('creates categories, services, groups, options and dependencies', async () => {
    const report = await importServices(db, example)
    expect(report.created).toHaveLength(5)
    expect(report.skipped).toEqual([])
    expect(report.categoriesCreated).toEqual([
      'Content management',
      'Forms',
      'Support',
    ])

    expect((await listCategories(db)).map((c) => c.name)).toEqual([
      'Content management',
      'Forms',
      'Support',
    ])
    const rows = await listServices(db, 'all')
    const byName = (name: string) => rows.find((r) => r.name === name)!

    expect(rows.map((r) => r.name)).toEqual([
      'CMS setup',
      'Dynamic listing page',
      'Content schema',
      'Contact form',
      'Maintenance retainer',
    ])
    expect(byName('CMS setup')).toMatchObject({
      unitPrice: 10000,
      categoryName: 'Content management',
      estimatedDaysMin: 2,
      estimatedDaysMax: 3,
    })
    expect(byName('Dynamic listing page').requires.map((r) => r.name)).toEqual([
      'CMS setup',
    ])
    expect(byName('Dynamic listing page').options).toMatchObject([
      { name: 'Rush delivery', modifierType: 'percent', modifierValue: 2500 },
    ])
    expect(byName('Content schema')).toMatchObject({
      pricingMode: 'custom',
      unitPrice: 1500,
    })
    expect(byName('Contact form')).toMatchObject({ maxQuantity: 1 })
    expect(byName('Contact form').groups).toMatchObject([
      { name: 'Spam protection', selection: 'single', required: true },
    ])
    expect(
      byName('Contact form').options.map((o) => [o.name, o.modifierValue]),
    ).toEqual([
      ['Honeypot field', 0],
      ['CAPTCHA', 1000],
    ])
    expect(byName('Maintenance retainer')).toMatchObject({
      billing: 'monthly',
      taxable: false,
    })
  })

  it('gives every imported row a CUID', async () => {
    await importServices(db, example)
    const ids = [
      ...(await db.select().from(schema.services)),
      ...(await db.select().from(schema.serviceOptions)),
      ...(await db.select().from(schema.serviceOptionGroups)),
      ...(await db.select().from(schema.serviceDependencies)),
      ...(await db.select().from(schema.serviceCategories)),
    ].map((r) => r.id)
    expect(ids.length).toBeGreaterThan(10)
    for (const id of ids) expect(isCuid(id)).toBe(true)
  })

  it('creates nothing on a second run', async () => {
    await importServices(db, example)
    const second = await importServices(db, example)
    expect(second).toEqual({
      created: [],
      skipped: example.services.map((s: { name: string }) => s.name),
      categoriesCreated: [],
    })
    expect(await db.select().from(schema.services)).toHaveLength(5)
    expect(await db.select().from(schema.serviceDependencies)).toHaveLength(2)
    expect(await db.select().from(schema.serviceCategories)).toHaveLength(3)
  })

  it('imports only new services and reuses existing ones as requirements', async () => {
    await importServices(db, { services: [{ name: 'Base', price: 10 }] })
    const report = await importServices(db, {
      services: [
        { name: 'base', price: 99 },
        { name: 'Addon', price: 5, requires: ['BASE'] },
      ],
    })
    expect(report).toMatchObject({ created: ['Addon'], skipped: ['base'] })
    const rows = await listServices(db, 'all')
    expect(rows.find((r) => r.name === 'Base')?.unitPrice).toBe(1000)
    expect(rows.find((r) => r.name === 'Addon')?.requires[0].name).toBe('Base')
  })

  it('reuses an existing category by name', async () => {
    await importServices(db, {
      categories: ['SEO'],
      services: [{ name: 'A', price: 1, category: 'SEO' }],
    })
    const report = await importServices(db, {
      services: [{ name: 'B', price: 1, category: 'seo' }],
    })
    expect(report.categoriesCreated).toEqual([])
    expect(await listCategories(db)).toHaveLength(1)
  })

  it('writes nothing in a dry run', async () => {
    const report = await importServices(db, example, { dryRun: true })
    expect(report.created).toHaveLength(5)
    expect(await db.select().from(schema.services)).toHaveLength(0)
    expect(await db.select().from(schema.serviceCategories)).toHaveLength(0)
  })

  it('rejects an invalid file without writing', async () => {
    expect(await rejects({ services: [] })).toContain('The file is not valid')
    expect(
      await rejects({ services: [{ name: 'A', price: 1, extra: true }] }),
    ).toContain('The file is not valid')
  })

  it('rejects a service with an invalid price and names it', async () => {
    const message = await rejects({
      categories: ['X'],
      services: [{ name: 'Bad', price: '1.999' }],
    })
    expect(message).toContain('"Bad" is not valid')
    expect(message).toContain('unitPrice')
  })

  it('rejects duplicate names, unknown requirements and loops', async () => {
    expect(
      await rejects({
        services: [
          { name: 'A', price: 1 },
          { name: 'a', price: 1 },
        ],
      }),
    ).toContain('appears twice')
    expect(
      await rejects({
        services: [{ name: 'A', price: 1, requires: ['Ghost'] }],
      }),
    ).toContain('"Ghost"')
    expect(
      await rejects({
        services: [
          { name: 'A', price: 1, requires: ['B'] },
          { name: 'B', price: 1, requires: ['A'] },
        ],
      }),
    ).toContain('loop')
  })
})
