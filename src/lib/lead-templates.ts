import { z } from 'zod'
import { fillTemplate } from './email-template'

export const LEAD_TEMPLATE_VARIABLES = ['name', 'handle'] as const

const variableMessage = `Use only ${LEAD_TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(' and ')}`

const knownVariablesOnly = (value: string) =>
  [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].every((m) =>
    (LEAD_TEMPLATE_VARIABLES as readonly string[]).includes(m[1]),
  )

/** A message template. An empty string means "no template". */
export const leadTemplateSchema = z
  .string()
  .trim()
  .max(1000, 'Message must be 1000 characters or fewer')
  .refine(knownVariablesOnly, variableMessage)

/**
 * Fills `{{name}}` and `{{handle}}`. A lead with no name uses its handle for
 * `{{name}}`. Returns an empty string for an empty template.
 */
export const fillLeadTemplate = (
  template: string,
  lead: { name: string; handle: string },
) =>
  fillTemplate(template.trim(), {
    name: lead.name.trim() || lead.handle,
    handle: lead.handle,
  })
