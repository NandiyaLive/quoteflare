import { createStart } from '@tanstack/react-start'
import { guardAdminPaths } from '#/server/admin-middleware'

export const startInstance = createStart(() => ({
  requestMiddleware: [guardAdminPaths],
}))
