import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { createDb } from '#/db'
import { settingsSchema } from '#/lib/settings'
import { requireAdmin } from './admin-middleware'
import { loadSettings, saveSettings, storeLogo } from './settings'

export type SaveSettingsResult =
  { ok: true } | { ok: false; errors: Record<string, string> }

export const getSettings = createServerFn()
  .middleware([requireAdmin])
  .handler(() => loadSettings(createDb(env.DB)))

export const updateSettings = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .middleware([requireAdmin])
  .handler(async ({ data }): Promise<SaveSettingsResult> => {
    const parsed = settingsSchema.safeParse(data)
    if (!parsed.success) {
      const errors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form')
        errors[field] ??= issue.message
      }
      return { ok: false, errors }
    }
    await saveSettings(createDb(env.DB), parsed.data)
    return { ok: true }
  })

export const uploadLogo = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const file = input instanceof FormData ? input.get('logo') : null
    if (!(file instanceof File))
      throw new Error('Choose a logo file to upload.')
    return file
  })
  .middleware([requireAdmin])
  .handler(({ data }) => storeLogo(createDb(env.DB), env.FILES, data))
