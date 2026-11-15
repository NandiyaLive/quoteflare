import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { CircleDotIcon, GlobeIcon, SearchIcon } from 'lucide-react'
import PageHeader from '@/components/common/page-header'
import { DataTable } from '@/components/data-table/data-table'
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header'
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar'
import { useDataTable } from '@/hooks/use-data-table'
import type { DataTableFeatures } from '@/lib/data-table-features'
import { leadPlatforms, leadStatuses } from '#/db/schema'
import {
  LEAD_PLATFORM_LABELS,
  LEAD_STATUS_LABELS,
  OPEN_LEAD_STATUSES,
} from '#/lib/leads'
import type { LeadRow } from '#/server/leads'
import { getLeads } from '#/server/leads-actions'
import { formatDate } from '@/lib/format'
import { PlatformBadge, StatusBadge } from './-components/lead-badges'
import { CloseLeadDialog } from './-components/close-lead-dialog'
import { PasteLinkForm } from './-components/paste-link-form'
import { TodaySection } from './-components/today-section'
import { useLeadActions } from './-components/use-lead-actions'

export const Route = createFileRoute('/admin/leads/')({
  loader: () => getLeads(),
  component: LeadsPage,
})

function LeadsPage() {
  const { leads, today, maxFollowUps } = Route.useLoaderData()
  const { run, closeAsNoReply, pendingId, dialog } = useLeadActions()
  const [closing, setClosing] = useState<LeadRow | null>(null)

  const columns = useMemo<ColumnDef<DataTableFeatures, LeadRow>[]>(
    () => [
      {
        id: 'handle',
        accessorFn: (lead) => `${lead.handle} ${lead.name}`,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Lead" />
        ),
        cell: ({ row }) => (
          <div className="flex flex-col">
            <Link
              to="/admin/leads/$leadId"
              params={{ leadId: row.original.id }}
              className="font-medium underline-offset-4 hover:underline"
            >
              {row.original.handle}
            </Link>
            {row.original.name && (
              <span className="text-sm text-muted-foreground">
                {row.original.name}
              </span>
            )}
          </div>
        ),
        meta: {
          label: 'Lead',
          placeholder: 'Search by handle or name',
          variant: 'text',
          icon: SearchIcon,
        },
        enableColumnFilter: true,
      },
      {
        id: 'platform',
        accessorFn: (lead) => LEAD_PLATFORM_LABELS[lead.platform],
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Platform" />
        ),
        cell: ({ row }) => <PlatformBadge platform={row.original.platform} />,
        meta: {
          label: 'Platform',
          variant: 'multiSelect',
          icon: GlobeIcon,
          options: leadPlatforms.map((value) => ({
            label: LEAD_PLATFORM_LABELS[value],
            value: LEAD_PLATFORM_LABELS[value],
          })),
        },
        enableColumnFilter: true,
      },
      {
        id: 'status',
        accessorFn: (lead) => LEAD_STATUS_LABELS[lead.status],
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Status" />
        ),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
        meta: {
          label: 'Status',
          variant: 'multiSelect',
          icon: CircleDotIcon,
          options: leadStatuses.map((value) => ({
            label: LEAD_STATUS_LABELS[value],
            value: LEAD_STATUS_LABELS[value],
          })),
        },
        enableColumnFilter: true,
      },
      {
        id: 'nextActionOn',
        accessorFn: (lead) => lead.nextActionOn ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Next action" />
        ),
        cell: ({ row }) =>
          row.original.nextActionOn
            ? formatDate(row.original.nextActionOn, {
                month: 'short',
                timeZone: 'UTC',
              })
            : '',
        meta: { label: 'Next action' },
      },
    ],
    [],
  )

  const { table } = useDataTable({
    data: leads,
    columns,
    mode: 'client',
    getRowId: (lead) => lead.id,
    initialState: {
      pagination: { pageSize: 20, pageIndex: 0 },
      // Hides won and closed leads until the status filter includes them.
      columnFilters: [
        {
          id: 'status',
          value: OPEN_LEAD_STATUSES.map((status) => LEAD_STATUS_LABELS[status]),
        },
      ],
    },
  })

  return (
    <>
      <PageHeader
        title="Leads"
        description="Profiles you saved to message, and where each one stands."
      />
      <PasteLinkForm />
      <TodaySection
        leads={leads}
        today={today}
        maxFollowUps={maxFollowUps}
        pendingId={pendingId}
        onAction={(action) => void run(action)}
        onCloseAsNoReply={(lead) => void closeAsNoReply(lead)}
        onClose={setClosing}
      />
      <section className="flex flex-col gap-3" aria-labelledby="leads-all">
        <h2 id="leads-all" className="text-xl font-semibold tracking-tight">
          All leads
        </h2>
        <DataTable table={table}>
          <DataTableToolbar table={table} />
        </DataTable>
      </section>
      <CloseLeadDialog
        lead={closing}
        onClose={() => setClosing(null)}
        onConfirm={(id, reason) => run({ type: 'close', id, reason })}
      />
      {dialog}
    </>
  )
}
