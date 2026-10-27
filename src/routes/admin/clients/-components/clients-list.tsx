import { useMemo, useState } from 'react'
import { useConfirm } from '@/components/common/confirm-dialog'
import { Link, useRouter } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CircleDotIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
} from 'lucide-react'
import PageHeader from '@/components/common/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { DataTable } from '@/components/data-table/data-table'
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header'
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar'
import { useDataTable } from '@/hooks/use-data-table'
import type { DataTableFeatures } from '@/lib/data-table-features'
import { type ClientFormValues, toClientFormValues } from '#/lib/clients'
import type { ClientRow } from '#/server/clients'
import { setClientArchivedAction } from '#/server/clients-actions'
import { ClientDialog } from './client-dialog'
import { callAction } from '#/lib/action-errors'
import { toast } from 'sonner'

export function ClientsList({ clients }: { clients: ClientRow[] }) {
  const router = useRouter()
  const [dialog, setDialog] = useState<{
    open: boolean
    client: ClientFormValues | null
  }>({ open: false, client: null })

  const { confirm, dialog: confirmDialog } = useConfirm()

  const toggleArchived = async (client: ClientRow) => {
    if (
      !client.archived &&
      !(await confirm({
        title: `Archive ${client.name}?`,
        description:
          'Archived clients are hidden from the active list and cannot be picked for new invoices.',
        confirmLabel: 'Archive client',
      }))
    )
      return
    const result = await callAction(
      () =>
        setClientArchivedAction({
          data: { id: client.id, archived: !client.archived },
        }),
      'Could not update the client. Try again.',
    )
    if (result && !result.ok) toast.error('Client not found. Reload the page.')
    await router.invalidate()
  }

  const columns = useMemo<ColumnDef<DataTableFeatures, ClientRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (client) => `${client.name} ${client.company}`,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Name" />
        ),
        cell: ({ row }) => (
          <Link
            to="/admin/clients/$clientId"
            params={{ clientId: row.original.id }}
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.original.name}
          </Link>
        ),
        meta: {
          label: 'Name',
          placeholder: 'Search by name or company',
          variant: 'text',
          icon: SearchIcon,
        },
        enableColumnFilter: true,
      },
      {
        id: 'company',
        accessorKey: 'company',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Company" />
        ),
        meta: { label: 'Company' },
      },
      {
        id: 'email',
        accessorKey: 'email',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Email" />
        ),
        meta: { label: 'Email' },
      },
      {
        id: 'status',
        accessorFn: (client) => (client.archived ? 'Archived' : 'Active'),
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Status" />
        ),
        cell: ({ row }) => (
          <Badge variant={row.original.archived ? 'outline' : 'secondary'}>
            {row.original.archived ? 'Archived' : 'Active'}
          </Badge>
        ),
        meta: {
          label: 'Status',
          variant: 'multiSelect',
          icon: CircleDotIcon,
          options: [
            { label: 'Active', value: 'Active' },
            { label: 'Archived', value: 'Archived' },
          ],
        },
        enableColumnFilter: true,
      },
      {
        id: 'actions',
        size: 100,
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const client = row.original
          return (
            <div className="flex justify-end">
              <ButtonGroup>
                <Button
                  variant="outline"
                  size="icon-sm"
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
                  variant="outline"
                  size="icon-sm"
                  aria-label={`${client.archived ? 'Restore' : 'Archive'} ${client.name}`}
                  onClick={() => void toggleArchived(client)}
                >
                  {client.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                </Button>
              </ButtonGroup>
            </div>
          )
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const { table } = useDataTable({
    data: clients,
    columns,
    mode: 'client',
    getRowId: (client) => client.id,
    initialState: {
      pagination: { pageSize: 20, pageIndex: 0 },
      columnFilters: [{ id: 'status', value: ['Active'] }],
    },
  })

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
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
      <ClientDialog
        open={dialog.open}
        client={dialog.client}
        onClose={() => setDialog({ open: false, client: null })}
      />
      {confirmDialog}
    </>
  )
}
