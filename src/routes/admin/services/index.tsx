import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SERVICE_STATUS_FILTERS } from '#/lib/services'
import { getServices } from '#/server/services-actions'
import { ServicesManager } from './-components/services-manager'

export const Route = createFileRoute('/admin/services/')({
  staticData: { breadcrumb: 'Services' },
  validateSearch: z.looseObject({
    status: z.enum(SERVICE_STATUS_FILTERS).catch('active'),
  }),
  loaderDeps: ({ search }) => ({ status: search.status }),
  loader: ({ deps }) => getServices({ data: deps }),
  component: ServicesPage,
})

function ServicesPage() {
  const { services, categories, choices, currency } = Route.useLoaderData()
  const { status } = Route.useSearch()
  return (
    <ServicesManager
      services={services}
      categories={categories}
      choices={choices}
      currency={currency}
      status={status}
    />
  )
}
