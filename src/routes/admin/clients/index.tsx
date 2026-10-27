import { createFileRoute } from '@tanstack/react-router'
import { getClients } from '#/server/clients-actions'
import { ClientsList } from './-components/clients-list'

export const Route = createFileRoute('/admin/clients/')({
  staticData: { breadcrumb: 'Clients' },
  loader: () => getClients({ data: { q: '', status: 'all' } }),
  component: ClientsPage,
})

function ClientsPage() {
  return <ClientsList clients={Route.useLoaderData()} />
}
