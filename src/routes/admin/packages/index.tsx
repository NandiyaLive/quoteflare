import { createFileRoute } from '@tanstack/react-router'
import { getPackages } from '#/server/packages-actions'
import { PackagesManager } from './-components/packages-manager'

export const Route = createFileRoute('/admin/packages/')({
  loader: () => getPackages(),
  component: PackagesPage,
})

function PackagesPage() {
  const { packages, categories, services } = Route.useLoaderData()
  return (
    <PackagesManager
      packages={packages}
      categories={categories}
      services={services}
    />
  )
}
