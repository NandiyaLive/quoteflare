import { Badge } from '@/components/ui/badge'
import type { InvoiceStatus } from '#/db/schema'
import { INVOICE_STATUS_LABELS } from '#/lib/invoices'

const VARIANTS = {
  draft: 'outline',
  sent: 'default',
  paid: 'secondary',
  overdue: 'destructive',
  void: 'ghost',
} as const

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge variant={VARIANTS[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>
  )
}
