import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { getSchedules } from '#/server/recurring-actions'
import { useMemo } from 'react'
import { useConfirm } from '@/components/common/confirm-dialog'
import type { ColumnDef } from '@tanstack/react-table'
import {
  CircleDotIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
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
import { formatMinor } from '#/lib/decimal'
import { RECURRING_INTERVAL_LABELS } from '#/lib/recurring'
import type { RecurringRow } from '#/server/recurring'
import { setScheduleActiveAction } from '#/server/recurring-actions'
import { callAction } from '#/lib/action-errors'
import { toast } from 'sonner'

export const Route = createFileRoute('/admin/recurring/')({
  loader: () => getSchedules(),
  component: RecurringPage,
})

function RecurringPage() {
  const schedules = Route.useLoaderData()
  const router = useRouter()

  const { confirm, dialog } = useConfirm()

  const toggleActive = async (schedule: RecurringRow) => {
    if (
      schedule.active &&
      !(await confirm({
        title: `Pause schedule for ${schedule.clientName}?`,
        description:
          'No invoices are created for this schedule until you resume it.',
        confirmLabel: 'Pause schedule',
      }))
    )
      return
    const result = await callAction(
      () =>
        setScheduleActiveAction({
          data: { id: schedule.id, active: !schedule.active },
        }),
      'Could not update the schedule. Try again.',
    )
    if (result && !result.ok) {
      toast.error('Schedule not found. Reload the page.')
    }
    await router.invalidate()
  }

  const columns = useMemo<ColumnDef<DataTableFeatures, RecurringRow>[]>(
    () => [
      {
        id: 'client',
        accessorFn: (row) => `${row.clientName} ${row.clientCompany}`,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Client" />
        ),
        cell: ({ row }) => (
          <Link
            to="/admin/recurring/$scheduleId"
            params={{ scheduleId: row.original.id }}
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.original.clientName}
          </Link>
        ),
        meta: {
          label: 'Client',
          placeholder: 'Search by client',
          variant: 'text',
          icon: SearchIcon,
        },
        enableColumnFilter: true,
      },
      {
        id: 'interval',
        accessorFn: (row) => RECURRING_INTERVAL_LABELS[row.interval],
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Interval" />
        ),
        meta: { label: 'Interval' },
      },
      {
        id: 'nextRunDate',
        accessorKey: 'nextRunDate',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Next run" />
        ),
        meta: { label: 'Next run' },
      },
      {
        id: 'total',
        accessorKey: 'total',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Amount" />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatMinor(row.original.total, row.original.currency)}
          </span>
        ),
        meta: { label: 'Amount' },
      },
      {
        id: 'autoSend',
        accessorFn: (row) => (row.autoSend ? 'Email' : 'Draft'),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Creates" />
        ),
        meta: { label: 'Creates' },
      },
      {
        id: 'status',
        accessorFn: (row) => (row.active ? 'Active' : 'Paused'),
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Status" />
        ),
        cell: ({ row }) => (
          <Badge variant={row.original.active ? 'secondary' : 'outline'}>
            {row.original.active ? 'Active' : 'Paused'}
          </Badge>
        ),
        meta: {
          label: 'Status',
          variant: 'multiSelect',
          icon: CircleDotIcon,
          options: [
            { label: 'Active', value: 'Active' },
            { label: 'Paused', value: 'Paused' },
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
          const schedule = row.original
          return (
            <div className="flex justify-end">
              <ButtonGroup>
                <Button
                  variant="outline"
                  size="icon-sm"
                  nativeButton={false}
                  aria-label={`Edit schedule for ${schedule.clientName}`}
                  render={
                    <Link
                      to="/admin/recurring/$scheduleId"
                      params={{ scheduleId: schedule.id }}
                    />
                  }
                >
                  <PencilIcon />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`${schedule.active ? 'Pause' : 'Resume'} schedule for ${schedule.clientName}`}
                  onClick={() => void toggleActive(schedule)}
                >
                  {schedule.active ? <PauseIcon /> : <PlayIcon />}
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
    data: schedules,
    columns,
    mode: 'client',
    getRowId: (schedule) => schedule.id,
    initialState: { pagination: { pageSize: 20, pageIndex: 0 } },
  })

  return (
    <>
      <PageHeader
        title="Recurring"
        description="Invoices created on a schedule by the daily job."
      >
        <Button
          nativeButton={false}
          render={<Link to="/admin/recurring/new" />}
        >
          <PlusIcon />
          New schedule
        </Button>
      </PageHeader>
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
      {dialog}
    </>
  )
}
