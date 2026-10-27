import { Link, useMatches } from '@tanstack/react-router'
import { Fragment } from 'react'
import { loaderCrumb } from '#/lib/breadcrumbs'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

export function AdminBreadcrumbs() {
  const crumbs = useMatches({
    select: (matches) =>
      matches.flatMap((match) =>
        match.staticData.breadcrumb
          ? [
              {
                id: match.id,
                to: match.pathname,
                label:
                  loaderCrumb(match.loaderData) ?? match.staticData.breadcrumb,
              },
            ]
          : [],
      ),
  })

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.id}>
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {index === crumbs.length - 1 ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink render={<Link to={crumb.to} />}>
                  {crumb.label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
