import { createFileRoute } from '@tanstack/react-router'
import { getServices } from '#/server/services-actions'
import { ServicesManager } from './-components/services-manager'

export const Route = createFileRoute('/admin/services/')({
  staticData: { breadcrumb: 'Services' },
  loader: () => getServices({ data: { status: 'all' } }),
  component: ServicesPage,
})

function ServicesPage() {
  const { services, categories, choices, currency } = Route.useLoaderData()
  return (
    <ServicesManager
      services={services}
      categories={categories}
      choices={choices}
      currency={currency}
    />
  )
}
