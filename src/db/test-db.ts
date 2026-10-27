import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Miniflare } from 'miniflare'

const migrationsDir = join(import.meta.dirname, '../../drizzle')

export async function createTestD1() {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response(null) } }',
    d1Databases: { DB: crypto.randomUUID() },
  })
  const d1 = await mf.getD1Database('DB')

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    const statements = readFileSync(join(migrationsDir, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean)
    await d1.batch(statements.map((s) => d1.prepare(s)))
  }

  return { d1, dispose: () => mf.dispose() }
}
