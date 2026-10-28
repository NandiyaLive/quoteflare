import { z } from 'zod'

const CLIENT_STATUS_FILTERS = ['active', 'archived', 'all'] as const

export const clientSchema = z.strictObject({
  id: z.string().min(1).max(64).optional(),
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(120, 'Name must be 120 characters or fewer'),
  company: z
    .string()
    .trim()
    .max(120, 'Company must be 120 characters or fewer'),
  email: z
    .string()
    .trim()
    .max(254, 'Email must be 254 characters or fewer')
    .refine(
      (value) => value === '' || z.email().safeParse(value).success,
      'Enter a valid email address',
    ),
  address: z
    .string()
    .trim()
    .max(500, 'Address must be 500 characters or fewer'),
  notes: z.string().trim().max(5000, 'Notes must be 5000 characters or fewer'),
})

export type ClientFormValues = z.infer<typeof clientSchema>

export const emptyClient: ClientFormValues = {
  name: '',
  company: '',
  email: '',
  address: '',
  notes: '',
}

export const clientFilterSchema = z.object({
  q: z.string().trim().max(100).catch('').default(''),
  status: z.enum(CLIENT_STATUS_FILTERS).catch('active').default('active'),
})

export type ClientFilter = z.infer<typeof clientFilterSchema>

export const clientArchiveSchema = z.strictObject({
  id: z.string().min(1).max(64),
  archived: z.boolean(),
})

export const toClientFormValues = (
  client: ClientFormValues & { id: string },
): ClientFormValues => ({
  id: client.id,
  name: client.name,
  company: client.company,
  email: client.email,
  address: client.address,
  notes: client.notes,
})
