import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb, schema, type Db } from '#/db'
import { createTestD1 } from '#/db/test-db'
import { clientFilterSchema, clientSchema } from '#/lib/clients'
import { isCuid } from '#/lib/id'
import {
  getClient,
  listActiveClients,
  listClients,
  saveClient,
  setClientArchived,
} from './clients'

let db: Db
let dispose: () => Promise<void>

beforeAll(async () => {
  const test = await createTestD1()
  db = createDb(test.d1)
  dispose = test.dispose
})

afterAll(() => dispose())

beforeEach(async () => {
  await db.delete(schema.invoiceItems)
  await db.delete(schema.invoices)
  await db.delete(schema.clients)
})

const values = (name: string, extra: Record<string, string> = {}) =>
  clientSchema.parse({
    name,
    company: '',
    email: '',
    address: '',
    notes: '',
    ...extra,
  })

const filter = (q = '', status: 'active' | 'archived' | 'all' = 'active') =>
  clientFilterSchema.parse({ q, status })

describe('client validation', () => {
  const base = { company: '', email: '', address: '', notes: '' }

  it('requires a name', () => {
    expect(clientSchema.safeParse({ ...base, name: '  ' }).success).toBe(false)
  })

  it('rejects a malformed email and accepts an empty one', () => {
    expect(
      clientSchema.safeParse({ ...base, name: 'A', email: 'nope' }).success,
    ).toBe(false)
    expect(
      clientSchema.safeParse({ ...base, name: 'A', email: 'a@b.co' }).success,
    ).toBe(true)
    expect(clientSchema.safeParse({ ...base, name: 'A' }).success).toBe(true)
  })

  it('rejects unknown fields', () => {
    expect(
      clientSchema.safeParse({ ...base, name: 'A', archived: true }).success,
    ).toBe(false)
  })
})

describe('clients', () => {
  it('creates a client with a CUID and edits it', async () => {
    const created = await saveClient(db, values('Acme Ltd'))
    if (!created.ok) throw new Error('save failed')
    expect(isCuid(created.id)).toBe(true)

    await saveClient(
      db,
      values('Acme Limited', { id: created.id, email: 'hi@acme.test' }),
    )
    const row = await getClient(db, created.id)
    expect(row).toMatchObject({
      name: 'Acme Limited',
      email: 'hi@acme.test',
      archived: false,
    })
    expect(await listClients(db, filter('', 'all'))).toHaveLength(1)
  })

  it('rejects editing a client that does not exist', async () => {
    const result = await saveClient(db, values('Ghost', { id: 'missing' }))
    expect(result.ok).toBe(false)
    expect(await listClients(db, filter('', 'all'))).toHaveLength(0)
  })

  it('searches name and company regardless of case', async () => {
    await saveClient(db, values('Acme Ltd'))
    await saveClient(db, values('Jane', { company: 'ACME Studio' }))
    await saveClient(db, values('Other'))
    const names = (await listClients(db, filter('acme'))).map((c) => c.name)
    expect(names.sort()).toEqual(['Acme Ltd', 'Jane'])
    expect(await listClients(db, filter('ACME LTD'))).toHaveLength(1)
  })

  it('treats percent and underscore in the search as literal text', async () => {
    await saveClient(db, values('Acme Ltd'))
    expect(await listClients(db, filter('%'))).toHaveLength(0)
    expect(await listClients(db, filter('_cme'))).toHaveLength(0)
  })

  it('hides archived clients from the default list and the picker', async () => {
    const a = await saveClient(db, values('Alpha'))
    await saveClient(db, values('Beta'))
    if (!a.ok) throw new Error('save failed')
    expect(await setClientArchived(db, a.id, true)).toBe(true)

    expect((await listClients(db, filter())).map((c) => c.name)).toEqual([
      'Beta',
    ])
    expect((await listActiveClients(db)).map((c) => c.name)).toEqual(['Beta'])
    expect(
      (await listClients(db, filter('', 'archived'))).map((c) => c.name),
    ).toEqual(['Alpha'])
    expect(await listClients(db, filter('', 'all'))).toHaveLength(2)

    await setClientArchived(db, a.id, false)
    expect(await listClients(db, filter())).toHaveLength(2)
  })

  it('reports an unknown id when archiving', async () => {
    expect(await setClientArchived(db, 'missing', true)).toBe(false)
  })
})
