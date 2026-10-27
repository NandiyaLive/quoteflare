import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import StatusPage from '#/components/common/status-page'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: () => (
      <StatusPage
        title="Page not found"
        message="The page you requested does not exist."
      />
    ),
    defaultErrorComponent: () => (
      <StatusPage
        title="Something went wrong"
        message="The page could not be loaded. Try again in a moment."
      />
    ),
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
