import { createFileRoute, Link } from '@tanstack/react-router'
import { getInvoices } from '#/server/invoices-actions'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { CircleDotIcon, PlusIcon, SearchIcon } from 'lucide-react'
import PageHeader from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/data-table/data-table'
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header'
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar'
import { useDataTable } from '@/hooks/use-data-table'
import type { DataTableFeatures } from '@/lib/data-table-features'
import { formatDate } from '@/lib/format'
import { ConvertedAmount } from '@/components/common/converted-amount'
import { formatMinor } from '#/lib/decimal'
import { INVOICE_STATUS_OPTIONS } from '#/lib/invoices'
import type { InvoiceListRow } from '#/server/invoices'
import { InvoiceStatusBadge } from './-components/invoice-status-badge'

export const Route = createFileRoute('/admin/invoices/')({
  loader: () => getInvoices(),
  component: InvoicesPage,
})

function InvoicesPage() {
  const invoices = Route.useLoaderData()
  const columns = useMemo<ColumnDef<DataTableFeatures, InvoiceListRow>[]>(
    () => [
      {
        id: 'number',
        accessorFn: (invoice) =>
          `${invoice.number} ${invoice.clientName} ${invoice.clientCompany}`,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Number" />
        ),
        cell: ({ row }) => (
          <Link
            to="/admin/invoices/$invoiceId"
            params={{ invoiceId: row.original.id }}
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.original.number}
          </Link>
        ),
        meta: {
          label: 'Number',
          placeholder: 'Search by number or client',
          variant: 'text',
          icon: SearchIcon,
        },
        enableColumnFilter: true,
      },
      {
        id: 'client',
        accessorFn: (invoice) => invoice.clientName,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Client" />
        ),
        cell: ({ row }) => (
          <Link
            to="/admin/clients/$clientId"
            params={{ clientId: row.original.clientId }}
            className="underline-offset-4 hover:underline"
          >
            {row.original.clientName}
          </Link>
        ),
        meta: { label: 'Client' },
      },
      {
        id: 'status',
        accessorFn: (invoice) => invoice.status,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Status" />
        ),
        cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} />,
        meta: {
          label: 'Status',
          variant: 'multiSelect',
          icon: CircleDotIcon,
          options: INVOICE_STATUS_OPTIONS,
        },
        enableColumnFilter: true,
      },
      {
        id: 'total',
        accessorFn: (invoice) => invoice.total,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            label="Total"
            className="justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="tabular-nums">
            {formatMinor(row.original.total, row.original.currency)}
            <ConvertedAmount
              minor={row.original.total}
              currency={row.original.currency}
              record={row.original}
            />
          </div>
        ),
        meta: { label: 'Total' },
      },
      {
        id: 'dueDate',
        accessorFn: (invoice) => invoice.dueDate,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Due date" />
        ),
        cell: ({ row }) =>
          formatDate(`${row.original.dueDate}T00:00:00`, { month: 'short' }),
        meta: { label: 'Due date' },
      },
    ],
    [],
  )

  const { table } = useDataTable({
    data: invoices,
    columns,
    mode: 'client',
    getRowId: (invoice) => invoice.id,
    initialState: { pagination: { pageSize: 20, pageIndex: 0 } },
  })

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Draft, send and track what you bill."
      >
        <Button nativeButton={false} render={<Link to="/admin/invoices/new" />}>
          <PlusIcon />
          New invoice
        </Button>
      </PageHeader>
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
    </>
  )
}
