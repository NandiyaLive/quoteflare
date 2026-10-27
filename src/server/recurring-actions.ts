import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { createDb } from '#/db'
import { recurringActiveSchema, recurringSchema } from '#/lib/recurring'
import { requireAdmin } from './admin-middleware'
import { listActiveClients } from './clients'
import {
  getSchedule,
  listSchedules,
  saveSchedule,
  setScheduleActive,
} from './recurring'

export type SaveRecurringActionResult =
  { ok: true; id: string } | { ok: false; errors: Record<string, string> }

export const getSchedules = createServerFn()
  .middleware([requireAdmin])
  .handler(() => listSchedules(createDb(env.DB)))

export const getScheduleDetail = createServerFn()
  .validator((input: unknown) => String(input))
  .middleware([requireAdmin])
  .handler(({ data }) => getSchedule(createDb(env.DB), data))

export const getRecurringFormContext = createServerFn()
  .middleware([requireAdmin])
  .handler(async () => {
    const db = createDb(env.DB)
    const [clients, settings] = await Promise.all([
      listActiveClients(db),
      db.query.settings.findFirst(),
    ])
    return {
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        company: c.company,
      })),
      currency: settings?.currency ?? 'LKR',
    }
  })

export const saveScheduleAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .middleware([requireAdmin])
  .handler(async ({ data }): Promise<SaveRecurringActionResult> => {
    const parsed = recurringSchema.safeParse(data)
    if (!parsed.success) {
      const errors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        errors[issue.path.join('.') || 'form'] ??= issue.message
      }
      return { ok: false, errors }
    }
    const result = await saveSchedule(createDb(env.DB), parsed.data)
    return result.ok ? result : { ok: false, errors: { form: result.error } }
  })

export const setScheduleActiveAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => recurringActiveSchema.parse(input))
  .middleware([requireAdmin])
  .handler(async ({ data }) => ({
    ok: await setScheduleActive(createDb(env.DB), data.id, data.active),
  }))
