import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb, schema, type Db } from '#/db'
import { createTestD1 } from '#/db/test-db'
import { createId } from '#/lib/id'
import { packageSchema } from '#/lib/packages'
import {
  listPackages,
  reorderPackages,
  savePackage,
  setPackageActive,
} from './packages'

let db: Db
let dispose: () => Promise<void>

beforeAll(async () => {
  const test = await createTestD1()
  db = createDb(test.d1)
  dispose = test.dispose
})

afterAll(() => dispose())

const serviceId = createId()
const otherServiceId = createId()
const optionId = createId()

beforeEach(async () => {
  await db.delete(schema.packageItems)
  await db.delete(schema.packages)
  await db.delete(schema.serviceOptions)
  await db.delete(schema.services)
  await db.insert(schema.services).values([
    { id: serviceId, name: 'Logo', unitPrice: 1000 },
    { id: otherServiceId, name: 'Site', unitPrice: 2000 },
  ])
  await db.insert(schema.serviceOptions).values({
    id: optionId,
    serviceId,
    name: 'Rush',
    modifierType: 'flat',
    modifierValue: 500,
  })
})

const parse = (input: unknown) => packageSchema.parse(input)

const form = (items: unknown[], name = 'Starter') => ({
  name,
  description: 'desc',
  items,
})

describe('packageSchema', () => {
  it('requires a service and a whole quantity', () => {
    expect(packageSchema.safeParse(form([])).success).toBe(false)
    expect(
      packageSchema.safeParse(
        form([{ serviceId, quantity: '0', optionIds: [] }]),
      ).success,
    ).toBe(false)
  })

  it('rejects the same service twice', () => {
    const item = { serviceId, quantity: '1', optionIds: [] }
    expect(packageSchema.safeParse(form([item, item])).success).toBe(false)
  })
})

describe('savePackage', () => {
  it('saves items with quantities and options in order', async () => {
    const result = await savePackage(
      db,
      parse(
        form([
          { serviceId: otherServiceId, quantity: '2', optionIds: [] },
          { serviceId, quantity: '1', optionIds: [optionId] },
        ]),
      ),
    )
    expect(result.ok).toBe(true)
    const [pkg] = await listPackages(db)
    expect(pkg.items.map((i) => [i.serviceName, i.quantity])).toEqual([
      ['Site', 2],
      ['Logo', 1],
    ])
    expect(pkg.items[1].optionIds).toEqual([optionId])
  })

  it('replaces items on update', async () => {
    const created = await savePackage(
      db,
      parse(form([{ serviceId, quantity: '1', optionIds: [] }])),
    )
    if (!created.ok) throw new Error('save failed')
    await savePackage(
      db,
      parse({
        id: created.id,
        ...form([{ serviceId: otherServiceId, quantity: '3', optionIds: [] }]),
      }),
    )
    const packages = await listPackages(db)
    expect(packages).toHaveLength(1)
    expect(packages[0].items).toHaveLength(1)
    expect(packages[0].items[0].serviceName).toBe('Site')
  })

  it('rejects an option that belongs to another service', async () => {
    const result = await savePackage(
      db,
      parse(
        form([
          { serviceId: otherServiceId, quantity: '1', optionIds: [optionId] },
        ]),
      ),
    )
    expect(result).toEqual({
      ok: false,
      errors: { 'items[0].optionIds': 'An option was not found.' },
    })
  })

  it('rejects an unknown service and an unknown package', async () => {
    const unknownService = await savePackage(
      db,
      parse(form([{ serviceId: 'nope', quantity: '1', optionIds: [] }])),
    )
    expect(unknownService.ok).toBe(false)
    const unknownPackage = await savePackage(
      db,
      parse({
        id: 'nope',
        ...form([{ serviceId, quantity: '1', optionIds: [] }]),
      }),
    )
    expect(unknownPackage.ok).toBe(false)
  })
})

describe('setPackageActive and reorderPackages', () => {
  it('archives a package and hides it from the active list', async () => {
    const created = await savePackage(
      db,
      parse(form([{ serviceId, quantity: '1', optionIds: [] }])),
    )
    if (!created.ok) throw new Error('save failed')
    expect(await setPackageActive(db, created.id, false)).toBe(true)
    expect(await listPackages(db, 'active')).toHaveLength(0)
    expect(await listPackages(db, 'all')).toHaveLength(1)
    expect(await setPackageActive(db, 'nope', true)).toBe(false)
  })

  it('reorders packages', async () => {
    const item = { serviceId, quantity: '1', optionIds: [] }
    const a = await savePackage(db, parse(form([item], 'A')))
    const b = await savePackage(db, parse(form([item], 'B')))
    if (!a.ok || !b.ok) throw new Error('save failed')
    expect((await listPackages(db)).map((p) => p.name)).toEqual(['A', 'B'])
    await reorderPackages(db, [b.id, a.id])
    expect((await listPackages(db)).map((p) => p.name)).toEqual(['B', 'A'])
  })
})
