import { useMemo, useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  PencilIcon,
  PlusIcon,
  TextIcon,
  FolderIcon,
} from 'lucide-react'
import PageHeader from '@/components/common/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ButtonGroup } from '@/components/ui/button-group'
import { DataTable } from '@/components/data-table/data-table'
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header'
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar'
import { useDataTable } from '@/hooks/use-data-table'
import type { DataTableFeatures } from '@/lib/data-table-features'
import { bpsToPercent, formatMinor } from '#/lib/decimal'
import { BILLING_LABELS, type ServiceStatusFilter } from '#/lib/services'
import type { CategoryRow, ServiceRow } from '#/server/services'
import {
  reorderServicesAction,
  setServiceActiveAction,
} from '#/server/services-actions'
import { CategoriesDialog } from './categories-dialog'
import { ServiceDialog, type ServiceChoice } from './service-dialog'

const FILTER_LABELS: Record<ServiceStatusFilter, string> = {
  active: 'Active services',
  archived: 'Archived services',
  all: 'All services',
}

export function ServicesManager({
  services,
  categories,
  choices,
  currency,
  status,
}: {
  services: ServiceRow[]
  categories: CategoryRow[]
  choices: ServiceChoice[]
  currency: string
  status: ServiceStatusFilter
}) {
  const router = useRouter()
  const navigate = useNavigate({ from: '/admin/services/' })
  const [editing, setEditing] = useState<ServiceRow | 'new' | null>(null)
  const [editingCategories, setEditingCategories] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) => {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      if (!result.ok) setError(result.error ?? 'Something went wrong.')
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  const move = (index: number, offset: -1 | 1) => {
    const ids = services.map((s) => s.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(index + offset, 0, moved)
    return run(() => reorderServicesAction({ data: { ids } }))
  }

  const toggle = (service: ServiceRow) =>
    run(() =>
      setServiceActiveAction({
        data: { id: service.id, active: !service.active },
      }),
    )

  const columns = useMemo<ColumnDef<DataTableFeatures, ServiceRow>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        size: 280,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Service" />
        ),
        cell: ({ row }) => {
          const service = row.original
          return (
            <div className="py-1 whitespace-normal" data-testid="service-row">
              <div className="font-medium">{service.name}</div>
              {service.description && (
                <div className="line-clamp-2 text-xs text-muted-foreground">
                  {service.description}
                </div>
              )}
              {service.note && (
                <div className="line-clamp-2 text-xs text-muted-foreground italic">
                  {service.note}
                </div>
              )}
            </div>
          )
        },
        meta: {
          label: 'Service',
          placeholder: 'Search services...',
          variant: 'text',
          icon: TextIcon,
        },
        enableColumnFilter: true,
      },
      {
        id: 'category',
        accessorFn: (service) => service.categoryName ?? '',
        size: 240,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Category" />
        ),
        cell: ({ row }) =>
          row.original.categoryName ?? (
            <span className="text-muted-foreground">None</span>
          ),
        meta: {
          label: 'Category',
          variant: 'multiSelect',
          icon: FolderIcon,
          options: categories.map((c) => ({ label: c.name, value: c.name })),
        },
        enableColumnFilter: true,
      },
      {
        id: 'price',
        size: 280,
        enableSorting: false,
        header: 'Price',
        cell: ({ row }) => {
          const service = row.original
          return (
            <div className="whitespace-normal">
              <div>
                {service.pricingMode === 'custom' ? 'From ' : ''}
                {formatMinor(service.unitPrice, currency)} / {service.unitLabel}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {service.billing !== 'one_time' && (
                  <Badge variant="secondary">
                    {BILLING_LABELS[service.billing]}
                  </Badge>
                )}
                {service.pricingMode === 'custom' && (
                  <Badge variant="outline">Set per quote</Badge>
                )}
                {!service.taxable && <Badge variant="outline">No tax</Badge>}
                {service.requires.length > 0 && (
                  <Badge variant="outline">
                    Requires {service.requires.map((r) => r.name).join(', ')}
                  </Badge>
                )}
              </div>
            </div>
          )
        },
      },
      {
        id: 'options',
        size: 220,
        enableSorting: false,
        header: 'Options',
        cell: ({ row }) =>
          row.original.options.length === 0 ? (
            <span className="text-muted-foreground">None</span>
          ) : (
            <ul className="flex flex-col gap-0.5 text-xs whitespace-normal">
              {row.original.options.map((option) => (
                <li key={option.id}>
                  {option.name}{' '}
                  <span className="text-muted-foreground">
                    {option.modifierType === 'flat'
                      ? `+${formatMinor(option.modifierValue, currency)}`
                      : `+${bpsToPercent(option.modifierValue)}%`}
                  </span>
                </li>
              ))}
            </ul>
          ),
      },
      {
        id: 'status',
        accessorFn: (service) => (service.active ? 'Active' : 'Archived'),
        size: 110,
        enableSorting: false,
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={row.original.active ? 'default' : 'secondary'}>
            {row.original.active ? 'Active' : 'Archived'}
          </Badge>
        ),
      },
      {
        id: 'actions',
        size: 170,
        enableSorting: false,
        enableHiding: false,
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const service = row.original
          const index = services.findIndex((s) => s.id === service.id)
          return (
            <div className="flex justify-end">
              <ButtonGroup>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Move ${service.name} up`}
                  disabled={busy || index === 0}
                  onClick={() => void move(index, -1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Move ${service.name} down`}
                  disabled={busy || index === services.length - 1}
                  onClick={() => void move(index, 1)}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Edit ${service.name}`}
                  onClick={() => setEditing(service)}
                >
                  <PencilIcon />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`${service.active ? 'Archive' : 'Restore'} ${service.name}`}
                  disabled={busy}
                  onClick={() => void toggle(service)}
                >
                  {service.active ? <ArchiveIcon /> : <ArchiveRestoreIcon />}
                </Button>
              </ButtonGroup>
            </div>
          )
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [services, categories, currency, busy],
  )

  const { table } = useDataTable({
    data: services,
    columns,
    mode: 'client',
    getRowId: (service) => service.id,
    initialState: { pagination: { pageSize: 20, pageIndex: 0 } },
  })

  return (
    <>
      <PageHeader
        title="Services"
        description="What the price calculator offers, with its options and requirements."
      >
        <Select
          value={status}
          onValueChange={(value) =>
            value &&
            void navigate({
              search: { status: value as ServiceStatusFilter },
            })
          }
        >
          <SelectTrigger aria-label="Filter services" className="w-44">
            <SelectValue>{FILTER_LABELS[status]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FILTER_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setEditingCategories(true)}>
          Categories
        </Button>
        <Button onClick={() => setEditing('new')}>
          <PlusIcon data-icon="inline-start" />
          New service
        </Button>
      </PageHeader>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>

      <CategoriesDialog
        open={editingCategories}
        categories={categories}
        onClose={() => setEditingCategories(false)}
      />
      <ServiceDialog
        editing={editing}
        categories={categories}
        choices={choices}
        currency={currency}
        onClose={() => setEditing(null)}
      />
    </>
  )
}
