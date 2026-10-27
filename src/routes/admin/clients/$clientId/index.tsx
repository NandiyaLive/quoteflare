import { createFileRoute, notFound } from '@tanstack/react-router'
import { getClientDetail } from '#/server/clients-actions'
import { ClientDetail } from '../-components/client-detail'

export const Route = createFileRoute('/admin/clients/$clientId/')({
  staticData: { breadcrumb: 'Client' },
  loader: async ({ params }) => {
    const detail = await getClientDetail({ data: params.clientId })
    if (!detail) throw notFound()
    return { ...detail, crumb: detail.client.name }
  },
  notFoundComponent: () => (
    <p className="text-muted-foreground">This client does not exist.</p>
  ),
  component: ClientPage,
})

function ClientPage() {
  const { client, invoices } = Route.useLoaderData()
  return <ClientDetail client={client} invoices={invoices} />
}
