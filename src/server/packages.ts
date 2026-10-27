import { asc, eq, inArray, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Db } from '#/db'
import { schema } from '#/db'
import { createId } from '#/lib/id'
import type { PackageData } from '#/lib/packages'

const { packages, packageItems, services, serviceOptions } = schema

export type PackageRow = {
  id: string
  name: string
  description: string
  active: boolean
  sortOrder: number
  items: {
    serviceId: string
    serviceName: string
    quantity: number
    optionIds: string[]
  }[]
}

export type SavePackageResult =
  { ok: true; id: string } | { ok: false; errors: Record<string, string> }

const order = [asc(packages.sortOrder), asc(packages.id)]

const batch = (db: Db, statements: BatchItem<'sqlite'>[]) =>
  db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

export async function listPackages(
  db: Db,
  status: 'active' | 'all' = 'all',
): Promise<PackageRow[]> {
  const rows = await db
    .select()
    .from(packages)
    .where(status === 'all' ? undefined : eq(packages.active, true))
    .orderBy(...order)
  if (rows.length === 0) return []

  const items = await db
    .select({
      packageId: packageItems.packageId,
      serviceId: packageItems.serviceId,
      serviceName: services.name,
      quantity: packageItems.quantity,
      optionIds: packageItems.optionIds,
    })
    .from(packageItems)
    .innerJoin(services, eq(services.id, packageItems.serviceId))
    .where(
      inArray(
        packageItems.packageId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(packageItems.sortOrder), asc(packageItems.id))

  return rows.map((row) => ({
    ...row,
    items: items
      .filter((i) => i.packageId === row.id)
      .map((i) => ({
        serviceId: i.serviceId,
        serviceName: i.serviceName,
        quantity: i.quantity,
        optionIds: i.optionIds,
      })),
  }))
}

export async function savePackage(
  db: Db,
  data: PackageData,
): Promise<SavePackageResult> {
  const fail = (key: string, message: string): SavePackageResult => ({
    ok: false,
    errors: { [key]: message },
  })

  const packageId = data.id ?? createId()
  if (data.id) {
    const existing = await db
      .select({ id: packages.id })
      .from(packages)
      .where(eq(packages.id, packageId))
    if (existing.length === 0)
      return fail('form', 'This package no longer exists.')
  }

  const serviceIds = data.items.map((i) => i.serviceId)
  const found = await db
    .select({ id: services.id })
    .from(services)
    .where(inArray(services.id, serviceIds))
  const knownServices = new Set(found.map((s) => s.id))
  const missing = data.items.findIndex((i) => !knownServices.has(i.serviceId))
  if (missing !== -1) {
    return fail(`items[${missing}].serviceId`, 'This service no longer exists.')
  }

  const options = await db
    .select({ id: serviceOptions.id, serviceId: serviceOptions.serviceId })
    .from(serviceOptions)
    .where(inArray(serviceOptions.serviceId, serviceIds))
  const optionOwner = new Map(options.map((o) => [o.id, o.serviceId]))
  const foreign = data.items.findIndex((i) =>
    i.optionIds.some((id) => optionOwner.get(id) !== i.serviceId),
  )
  if (foreign !== -1) {
    return fail(`items[${foreign}].optionIds`, 'An option was not found.')
  }

  const fields = { name: data.name, description: data.description }
  await batch(db, [
    data.id
      ? db.update(packages).set(fields).where(eq(packages.id, packageId))
      : db.insert(packages).values({
          id: packageId,
          ...fields,
          sortOrder: sql`(select coalesce(max(${packages.sortOrder}), -1) + 1 from ${packages})`,
        }),
    db.delete(packageItems).where(eq(packageItems.packageId, packageId)),
    ...data.items.map((item, index) =>
      db.insert(packageItems).values({
        packageId,
        serviceId: item.serviceId,
        quantity: item.quantity,
        optionIds: item.optionIds,
        sortOrder: index,
      }),
    ),
  ])
  return { ok: true, id: packageId }
}

export async function setPackageActive(
  db: Db,
  id: string,
  active: boolean,
): Promise<boolean> {
  const updated = await db
    .update(packages)
    .set({ active })
    .where(eq(packages.id, id))
    .returning({ id: packages.id })
  return updated.length > 0
}

export async function reorderPackages(
  db: Db,
  ids: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: 'The list contains a duplicate package.' }
  }
  const all = await db
    .select({ id: packages.id })
    .from(packages)
    .orderBy(...order)
  const known = new Set(all.map((p) => p.id))
  if (ids.some((id) => !known.has(id))) {
    return { ok: false, error: 'A package in the list no longer exists.' }
  }
  const moving = new Set(ids)
  const queue = [...ids]
  const next = all.map((p) => (moving.has(p.id) ? queue.shift()! : p.id))
  await batch(
    db,
    next.map((id, index) =>
      db.update(packages).set({ sortOrder: index }).where(eq(packages.id, id)),
    ),
  )
  return { ok: true }
}
