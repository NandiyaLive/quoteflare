import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createDb, schema } from '#/db'
import { requireAdmin } from './admin-middleware'

const subscriptionSchema = z.strictObject({
  endpoint: z.url({ protocol: /^https$/ }).max(2000),
  p256dh: z.string().min(1).max(200),
  auth: z.string().min(1).max(100),
  userAgent: z.string().max(300).default(''),
})

/** The public VAPID key, or null when push is not set up on the server. */
export const getPushPublicKey = createServerFn()
  .middleware([requireAdmin])
  .handler(() =>
    env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? env.VAPID_PUBLIC_KEY : null,
  )

/** Stores this device, or refreshes its keys when the endpoint is known. */
export const savePushSubscription = createServerFn({ method: 'POST' })
  .validator((input: unknown) => subscriptionSchema.parse(input))
  .middleware([requireAdmin])
  .handler(async ({ data }) => {
    await createDb(env.DB)
      .insert(schema.pushSubscriptions)
      .values(data)
      .onConflictDoUpdate({
        target: schema.pushSubscriptions.endpoint,
        set: {
          p256dh: data.p256dh,
          auth: data.auth,
          userAgent: data.userAgent,
        },
      })
    return { ok: true as const }
  })

export const removePushSubscription = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.string().max(2000).parse(input))
  .middleware([requireAdmin])
  .handler(async ({ data }) => {
    await createDb(env.DB)
      .delete(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.endpoint, data))
    return { ok: true as const }
  })
