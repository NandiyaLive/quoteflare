declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    breadcrumb?: string
  }
}

/** A loader can return `crumb` to replace the route's static breadcrumb label. */
export const loaderCrumb = (loaderData: unknown) =>
  typeof loaderData === 'object' &&
  loaderData !== null &&
  'crumb' in loaderData &&
  typeof loaderData.crumb === 'string'
    ? loaderData.crumb
    : undefined

export {}
