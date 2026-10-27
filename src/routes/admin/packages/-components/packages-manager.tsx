import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  PencilIcon,
  PlusIcon,
} from 'lucide-react'
import PageHeader from '@/components/common/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card, CardContent } from '@/components/ui/card'
import type { PackageRow } from '#/server/packages'
import {
  reorderPackagesAction,
  setPackageActiveAction,
} from '#/server/packages-actions'
import { PackageDialog, type ServiceChoice } from './package-dialog'

export function PackagesManager({
  packages,
  services,
}: {
  packages: PackageRow[]
  services: ServiceChoice[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<PackageRow | 'new' | null>(null)
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
    const ids = packages.map((p) => p.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(index + offset, 0, moved)
    return run(() => reorderPackagesAction({ data: { ids } }))
  }

  return (
    <>
      <PageHeader
        title="Packages"
        description="Ready-made starting points shown first in the price calculator."
      >
        <Button onClick={() => setEditing('new')}>
          <PlusIcon data-icon="inline-start" />
          New package
        </Button>
      </PageHeader>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {packages.length === 0 ? (
        <p className="text-muted-foreground">
          No packages yet. The calculator offers only Start from scratch.
        </p>
      ) : (
        <div className="grid gap-4">
          {packages.map((pkg, index) => (
            <Card key={pkg.id} data-testid="package-row">
              <CardContent className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{pkg.name}</h2>
                    {!pkg.active && <Badge variant="secondary">Archived</Badge>}
                  </div>
                  {pkg.description && (
                    <p className="text-sm text-muted-foreground">
                      {pkg.description}
                    </p>
                  )}
                  <p className="text-sm">
                    {pkg.items
                      .map((i) =>
                        i.quantity > 1
                          ? `${i.serviceName} x${i.quantity}`
                          : i.serviceName,
                      )
                      .join(', ')}
                  </p>
                </div>
                <ButtonGroup>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Move ${pkg.name} up`}
                    disabled={busy || index === 0}
                    onClick={() => void move(index, -1)}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Move ${pkg.name} down`}
                    disabled={busy || index === packages.length - 1}
                    onClick={() => void move(index, 1)}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Edit ${pkg.name}`}
                    onClick={() => setEditing(pkg)}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`${pkg.active ? 'Archive' : 'Restore'} ${pkg.name}`}
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        setPackageActiveAction({
                          data: { id: pkg.id, active: !pkg.active },
                        }),
                      )
                    }
                  >
                    {pkg.active ? <ArchiveIcon /> : <ArchiveRestoreIcon />}
                  </Button>
                </ButtonGroup>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PackageDialog
        editing={editing}
        services={services}
        onClose={() => setEditing(null)}
      />
    </>
  )
}
