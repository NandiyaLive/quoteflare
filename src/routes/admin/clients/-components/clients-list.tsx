import { useState } from 'react'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  PencilIcon,
  PlusIcon,
} from 'lucide-react'
import PageHeader from '@/components/common/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  CLIENT_STATUS_FILTERS,
  CLIENT_STATUS_LABELS,
  type ClientFilter,
  type ClientFormValues,
  type ClientStatusFilter,
  toClientFormValues,
} from '#/lib/clients'
import type { ClientRow } from '#/server/clients'
import { setClientArchivedAction } from '#/server/clients-actions'
import { ClientDialog } from './client-dialog'

export function ClientsList({
  clients,
  filter,
}: {
  clients: ClientRow[]
  filter: ClientFilter
}) {
  const navigate = useNavigate({ from: '/admin/clients/' })
  const router = useRouter()
  const [dialog, setDialog] = useState<{
    open: boolean
    client: ClientFormValues | null
  }>({ open: false, client: null })

  const toggleArchived = async (client: ClientRow) => {
    await setClientArchivedAction({
      data: { id: client.id, archived: !client.archived },
    })
    await router.invalidate()
  }

  return (
    <>
      <PageHeader
        title="Clients"
        description="The people and companies you invoice."
      >
        <Button onClick={() => setDialog({ open: true, client: null })}>
          <PlusIcon />
          New client
        </Button>
      </PageHeader>
      <div className="flex flex-wrap gap-2">
        <Input
          type="search"
          aria-label="Search clients"
          placeholder="Search by name or company"
          className="w-full sm:max-w-xs"
          value={filter.q}
          onChange={(e) =>
            void navigate({
              search: (prev) => ({ ...prev, q: e.target.value }),
              replace: true,
            })
          }
        />
        <Select
          value={filter.status}
          onValueChange={(value) =>
            void navigate({
              search: (prev) => ({
                ...prev,
                status: value as ClientStatusFilter,
              }),
            })
          }
        >
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue>{CLIENT_STATUS_LABELS[filter.status]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CLIENT_STATUS_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {CLIENT_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  No clients found.
                </TableCell>
              </TableRow>
            )}
            {clients.map((client) => (
              <TableRow key={client.id}>
                <TableCell>
                  <Link
                    to="/admin/clients/$clientId"
                    params={{ clientId: client.id }}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {client.name}
                  </Link>
                </TableCell>
                <TableCell>{client.company}</TableCell>
                <TableCell>{client.email}</TableCell>
                <TableCell>
                  <Badge variant={client.archived ? 'outline' : 'secondary'}>
                    {client.archived ? 'Archived' : 'Active'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${client.name}`}
                      onClick={() =>
                        setDialog({
                          open: true,
                          client: toClientFormValues(client),
                        })
                      }
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${client.archived ? 'Restore' : 'Archive'} ${client.name}`}
                      onClick={() => void toggleArchived(client)}
                    >
                      {client.archived ? (
                        <ArchiveRestoreIcon />
                      ) : (
                        <ArchiveIcon />
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ClientDialog
        open={dialog.open}
        client={dialog.client}
        onClose={() => setDialog({ open: false, client: null })}
      />
    </>
  )
}
