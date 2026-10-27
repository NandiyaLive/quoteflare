import { readFileSync } from 'node:fs'
import { getPlatformProxy } from 'wrangler'
import { createDb } from '#/db'
import { ImportError, importServices } from '#/server/services-import'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const file = args.find((a) => !a.startsWith('--'))

if (!file) {
  console.error('Usage: bun run services:import <file.json> [--dry-run]')
  process.exit(1)
}

const { env, dispose } = await getPlatformProxy<{ DB: D1Database }>()
try {
  const report = await importServices(
    createDb(env.DB),
    JSON.parse(readFileSync(file, 'utf8')),
    { dryRun },
  )
  const verb = dryRun ? 'Would create' : 'Created'
  console.log(`${verb} ${report.created.length} services.`)
  if (report.categoriesCreated.length > 0) {
    console.log(`${verb} categories: ${report.categoriesCreated.join(', ')}`)
  }
  if (report.skipped.length > 0) {
    console.log(`Skipped existing: ${report.skipped.join(', ')}`)
  }
} catch (error) {
  console.error(error instanceof ImportError ? error.message : error)
  process.exitCode = 1
} finally {
  await dispose()
}
