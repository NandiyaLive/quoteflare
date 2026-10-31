import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { dismissQuotesAction, getQuotes } from '#/server/quote-actions'
import { useMemo } from 'react'
import { Subscribe, type ColumnDef } from '@tanstack/react-table'
import { CircleDotIcon, DownloadIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { callAction } from '#/lib/action-errors'
import PageHeader from '@/components/common/page-header'
import { DataTable } from '@/components/data-table/data-table'
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header'
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar'
import { useDataTable } from '@/hooks/use-data-table'
import type { DataTableFeatures } from '@/lib/data-table-features'
import { formatDate } from '@/lib/format'
import { formatMinor } from '#/lib/decimal'
import { QUOTE_STATUS_LABELS, quotesToCsv } from '#/lib/quotes'
import type { QuoteRow } from '#/server/quotes'
import { QuoteStatusBadge } from './-components/quote-status-badge'

export const Route = createFileRoute('/admin/quotes/')({
  loader: () => getQuotes({ data: { status: 'all' } }),
  component: QuotesPage,
})

function QuotesPage() {
  const quotes = Route.useLoaderData()
  const router = useRouter()
  const { confirm, dialog } = useConfirm()

  const counts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const quote of quotes)
      result[quote.status] = (result[quote.status] ?? 0) + 1
    return result
  }, [quotes])

  const exportCsv = () => {
    const blob = new Blob([quotesToCsv(quotes)], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `quotes-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const columns = useMemo<ColumnDef<DataTableFeatures, QuoteRow>[]>(
    () => [
      {
        id: 'select',
        size: 40,
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Subscribe
            source={table.store}
            selector={() => table.getIsAllPageRowsSelected()}
          >
            {(all) => (
              <Checkbox
                aria-label="Select all quotes on this page"
                checked={all}
                onCheckedChange={(checked) =>
                  table.toggleAllPageRowsSelected(checked === true)
                }
              />
            )}
          </Subscribe>
        ),
        cell: ({ row, table }) => (
          <Subscribe source={table.store} selector={() => row.getIsSelected()}>
            {(selected) => (
              <Checkbox
                aria-label={`Select the quote from ${row.original.contactName}`}
                checked={selected}
                onCheckedChange={(checked) =>
                  row.toggleSelected(checked === true)
                }
              />
            )}
          </Subscribe>
        ),
      },
      {
        id: 'contact',
        accessorFn: (quote) =>
          `${quote.contactName} ${quote.contactEmail} ${quote.number ?? ''}`,
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
              {row.original.number ? `${row.original.number} · ` : ''}
              {row.original.source === 'admin' ? 'Created by you · ' : ''}
              {row.original.contactEmail}
            </div>
          </>
        ),
        meta: {
          label: 'Contact',
          placeholder: 'Search by name, email or number',
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
            ([value, label]) => ({
              value,
              label: `${label} (${counts[value] ?? 0})`,
            }),
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
    [counts],
  )

  const dismissSelected = async () => {
    const ids = Object.keys(table.store.state.rowSelection)
    if (ids.length === 0) return
    const ok = await confirm({
      title: `Dismiss ${ids.length} ${ids.length === 1 ? 'quote' : 'quotes'}?`,
      description:
        'Accepted and invoiced quotes are skipped. You can reopen a dismissed quote later.',
      confirmLabel: 'Dismiss',
    })
    if (!ok) return
    const result = await callAction(
      () => dismissQuotesAction({ data: { ids } }),
      'Could not dismiss the quotes. Try again.',
    )
    if (!result) return
    toast.success(
      `Dismissed ${result.dismissed} ${result.dismissed === 1 ? 'quote' : 'quotes'}.`,
    )
    table.resetRowSelection()
    await router.invalidate()
  }

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
        description={
          counts.new
            ? `${counts.new} new ${counts.new === 1 ? 'request' : 'requests'} waiting.`
            : 'Requests from the calculator and quotes you create.'
        }
      >
        <Button nativeButton={false} render={<Link to="/admin/quotes/new" />}>
          <PlusIcon data-icon="inline-start" />
          New quote
        </Button>
        <Button
          variant="outline"
          disabled={quotes.length === 0}
          onClick={exportCsv}
        >
          <DownloadIcon data-icon="inline-start" />
          Export CSV
        </Button>
      </PageHeader>
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <Subscribe
            source={table.store}
            selector={(state) => Object.keys(state.rowSelection).length}
          >
            {(selected) =>
              selected > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => void dismissSelected()}
                >
                  Dismiss {selected} selected
                </Button>
              )
            }
          </Subscribe>
        </DataTableToolbar>
      </DataTable>
      {dialog}
    </>
  )
}
