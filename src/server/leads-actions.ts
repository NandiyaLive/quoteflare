import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { createDb } from '#/db'
import { fieldErrors, firstSegment } from '#/lib/field-errors'
import {
  leadActionSchema,
  leadDetailsSchema,
  leadLinkSchema,
} from '#/lib/lead-inputs'
import { requireAdmin } from './admin-middleware'
import {
  applyLeadAction,
  loadLeadDetail,
  loadLeads,
  saveLead,
  updateLeadDetails,
  type LeadResult,
} from './leads'

export const getLeads = createServerFn()
  .middleware([requireAdmin])
  .handler(() => loadLeads(createDb(env.DB), new Date()))

export const getLeadDetail = createServerFn()
  .validator((input: unknown) => z.string().min(1).max(64).parse(input))
  .middleware([requireAdmin])
  .handler(({ data }) => loadLeadDetail(createDb(env.DB), data, new Date()))

export const saveLeadAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .middleware([requireAdmin])
  .handler(async ({ data }): Promise<LeadResult> => {
    const parsed = leadLinkSchema.safeParse(data)
    if (!parsed.success) {
      return {
        ok: false,
        error: fieldErrors(parsed.error, firstSegment).input ?? 'Invalid link.',
      }
    }
    return saveLead(createDb(env.DB), parsed.data.input, new Date())
  })

export const leadAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => leadActionSchema.parse(input))
  .middleware([requireAdmin])
  .handler(({ data }) => applyLeadAction(createDb(env.DB), data, new Date()))

export const updateLeadDetailsAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .middleware([requireAdmin])
  .handler(
    async ({
      data,
    }): Promise<
      { ok: true } | { ok: false; errors: Record<string, string> }
    > => {
      const parsed = leadDetailsSchema.safeParse(data)
      if (!parsed.success) {
        return { ok: false, errors: fieldErrors(parsed.error, firstSegment) }
      }
      const result = await updateLeadDetails(createDb(env.DB), parsed.data)
      return result.ok ? result : { ok: false, errors: { form: result.error } }
    },
  )
