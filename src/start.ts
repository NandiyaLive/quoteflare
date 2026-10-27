import { createCsrfMiddleware, createStart } from '@tanstack/react-start'
import { guardAdminPaths } from '#/server/admin-middleware'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, guardAdminPaths],
}))
