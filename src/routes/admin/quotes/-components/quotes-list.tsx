import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { CircleDotIcon, SearchIcon } from 'lucide-react'
import PageHeader from '@/components/common/page-header'
import { DataTable } from '@/components/data-table/data-table'
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header'
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar'
import { useDataTable } from '@/hooks/use-data-table'
import type { DataTableFeatures } from '@/lib/data-table-features'
import { formatDate } from '@/lib/format'
import { formatMinor } from '#/lib/decimal'
import { QUOTE_STATUS_LABELS } from '#/lib/quotes'
import type { QuoteRow } from '#/server/quotes'
import { QuoteStatusBadge } from './quote-status-badge'

export function QuotesList({ quotes }: { quotes: QuoteRow[] }) {
  const columns = useMemo<ColumnDef<DataTableFeatures, QuoteRow>[]>(
    () => [
      {
        id: 'contact',
        accessorFn: (quote) => `${quote.contactName} ${quote.contactEmail}`,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Contact" />
        ),
        cell: ({ row }) => (
          <>
            <Link
              to="/admin/quotes/$quoteId"
              params={{ quoteId: row.original.id }}
              className="font-medium underline-offset-4 hover:underline"
            >
              {row.original.contactName}
            </Link>
            <div className="text-muted-foreground">
              {row.original.contactEmail}
            </div>
          </>
        ),
        meta: {
          label: 'Contact',
          placeholder: 'Search by name or email',
          variant: 'text',
          icon: SearchIcon,
        },
        enableColumnFilter: true,
      },
      {
        id: 'received',
        accessorFn: (quote) => new Date(quote.createdAt).getTime(),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Received" />
        ),
        cell: ({ row }) =>
          formatDate(row.original.createdAt, { month: 'short' }),
        meta: { label: 'Received' },
      },
      {
        id: 'status',
        accessorFn: (quote) => quote.status,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Status" />
        ),
        cell: ({ row }) => <QuoteStatusBadge status={row.original.status} />,
        meta: {
          label: 'Status',
          variant: 'multiSelect',
          icon: CircleDotIcon,
          options: Object.entries(QUOTE_STATUS_LABELS).map(
            ([value, label]) => ({ value, label }),
          ),
        },
        enableColumnFilter: true,
      },
      {
        id: 'total',
        accessorFn: (quote) => quote.total,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            label="Total"
            className="justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right">
            {formatMinor(row.original.total, row.original.currency)}
          </div>
        ),
        meta: { label: 'Total' },
      },
    ],
    [],
  )

  const { table } = useDataTable({
    data: quotes,
    columns,
    mode: 'client',
    getRowId: (quote) => quote.id,
    initialState: { pagination: { pageSize: 20, pageIndex: 0 } },
  })

  return (
    <>
      <PageHeader
        title="Quotes"
        description="Requests submitted from the calculator."
      />
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
    </>
  )
}
