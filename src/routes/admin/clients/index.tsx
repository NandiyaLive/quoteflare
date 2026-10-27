import { createFileRoute } from '@tanstack/react-router'
import { clientFilterSchema } from '#/lib/clients'
import { getClients } from '#/server/clients-actions'
import { ClientsList } from './-components/clients-list'

export const Route = createFileRoute('/admin/clients/')({
  staticData: { breadcrumb: 'Clients' },
  validateSearch: clientFilterSchema,
  loaderDeps: ({ search }) => ({ q: search.q, status: search.status }),
  loader: ({ deps }) => getClients({ data: deps }),
  component: ClientsPage,
})

function ClientsPage() {
  const clients = Route.useLoaderData()
  return <ClientsList clients={clients} filter={Route.useSearch()} />
}
