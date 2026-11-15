import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { createDb } from '#/db'
import { fieldErrors, firstSegment } from '#/lib/field-errors'
import {
  leadActionSchema,
  leadClientSchema,
  leadDetailsSchema,
  leadLinkSchema,
} from '#/lib/lead-inputs'
import { requireAdmin } from './admin-middleware'
import {
  applyLeadAction,
  loadLeadDetail,
  findLeadByInput,
  loadLeads,
  makeClientFromLead,
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
    const { input, name, note } = parsed.data
    return saveLead(createDb(env.DB), input, new Date(), { name, note })
  })

/** Looks up the lead for a shared link without saving anything. */
export const findLeadAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.string().max(2000).parse(input))
  .middleware([requireAdmin])
  .handler(({ data }) => findLeadByInput(createDb(env.DB), data))

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

export const makeClientFromLeadAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .middleware([requireAdmin])
  .handler(
    async ({
      data,
    }): Promise<
      { ok: true; id: string } | { ok: false; errors: Record<string, string> }
    > => {
      const parsed = leadClientSchema.safeParse(data)
      if (!parsed.success) {
        return {
          ok: false,
          errors: fieldErrors(parsed.error, (path) =>
            path[0] === 'client' ? String(path[1] ?? 'form') : 'form',
          ),
        }
      }
      const result = await makeClientFromLead(createDb(env.DB), parsed.data)
      return result.ok ? result : { ok: false, errors: { form: result.error } }
    },
  )
