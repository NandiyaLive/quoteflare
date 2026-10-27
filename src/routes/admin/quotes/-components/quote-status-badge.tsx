import { Badge } from '@/components/ui/badge'
import type { QuoteStatus } from '#/db/schema'
import { QUOTE_STATUS_LABELS } from '#/lib/quotes'

const VARIANTS = {
  new: 'default',
  converted: 'secondary',
  dismissed: 'outline',
} as const

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return <Badge variant={VARIANTS[status]}>{QUOTE_STATUS_LABELS[status]}</Badge>
}
