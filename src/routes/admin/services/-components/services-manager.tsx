import { useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  PencilIcon,
  PlusIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Service</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Options</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {services.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={6}
                className="h-24 text-center text-muted-foreground"
              >
                {status === 'active'
                  ? 'No active services. Create one to get started.'
                  : 'No services to show.'}
              </TableCell>
            </TableRow>
          )}
          {services.map((service, index) => (
            <TableRow key={service.id} data-testid="service-row">
              <TableCell className="whitespace-normal">
                <div className="font-medium">{service.name}</div>
                {service.description && (
                  <div className="text-xs text-muted-foreground">
                    {service.description}
                  </div>
                )}
                {service.note && (
                  <div className="text-xs text-muted-foreground italic">
                    {service.note}
                  </div>
                )}
              </TableCell>
              <TableCell>
                {service.categoryName ?? (
                  <span className="text-muted-foreground">None</span>
                )}
              </TableCell>
              <TableCell className="whitespace-normal">
                <div>
                  {service.pricingMode === 'custom' ? 'From ' : ''}
                  {formatMinor(service.unitPrice, currency)} /{' '}
                  {service.unitLabel}
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
              </TableCell>
              <TableCell className="whitespace-normal">
                {service.options.length === 0 ? (
                  <span className="text-muted-foreground">None</span>
                ) : (
                  <ul className="flex flex-col gap-0.5 text-xs">
                    {service.options.map((option) => (
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
                )}
              </TableCell>
              <TableCell>
                <Badge variant={service.active ? 'default' : 'secondary'}>
                  {service.active ? 'Active' : 'Archived'}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${service.name} up`}
                    disabled={busy || index === 0}
                    onClick={() => void move(index, -1)}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${service.name} down`}
                    disabled={busy || index === services.length - 1}
                    onClick={() => void move(index, 1)}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${service.name}`}
                    onClick={() => setEditing(service)}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${service.active ? 'Archive' : 'Restore'} ${service.name}`}
                    disabled={busy}
                    onClick={() => void toggle(service)}
                  >
                    {service.active ? <ArchiveIcon /> : <ArchiveRestoreIcon />}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
    </div>
  )
}
