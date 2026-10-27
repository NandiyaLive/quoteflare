import { useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import PageHeader from '@/components/common/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/lib/format'
import { toClientFormValues } from '#/lib/clients'
import type { ClientInvoiceRow, ClientRow } from '#/server/clients'
import { setClientArchivedAction } from '#/server/clients-actions'
import { ClientDialog } from './client-dialog'

export function ClientDetail({
  client,
  invoices,
}: {
  client: ClientRow
  invoices: ClientInvoiceRow[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)

  const toggleArchived = async () => {
    await setClientArchivedAction({
      data: { id: client.id, archived: !client.archived },
    })
    await router.invalidate()
  }

  return (
    <>
      <PageHeader
        title={client.name}
        description={
          <span className="inline-flex items-center gap-2">
            <Badge variant={client.archived ? 'outline' : 'secondary'}>
              {client.archived ? 'Archived' : 'Active'}
            </Badge>
            {client.company}
          </span>
        }
      >
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link to="/admin/clients" search={{ q: '', status: 'active' }} />
          }
        >
          Back to clients
        </Button>
        <Button variant="outline" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button variant="outline" onClick={() => void toggleArchived()}>
          {client.archived ? 'Restore' : 'Archive'}
        </Button>
      </PageHeader>
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No invoices for this client yet.
                    </TableCell>
                  </TableRow>
                )}
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.number}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                    <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <div>
              <p className="mb-1 font-medium">Email</p>
              {client.email ? (
                <a
                  href={`mailto:${client.email}`}
                  className="text-muted-foreground underline-offset-4 hover:underline"
                >
                  {client.email}
                </a>
              ) : (
                <p className="text-muted-foreground">No email.</p>
              )}
            </div>
            <div>
              <p className="mb-1 font-medium">Address</p>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {client.address || 'No address.'}
              </p>
            </div>
            <div>
              <p className="mb-1 font-medium">Notes</p>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {client.notes || 'No notes.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      <ClientDialog
        open={editing}
        client={toClientFormValues(client)}
        onClose={() => setEditing(false)}
      />
    </>
  )
}
