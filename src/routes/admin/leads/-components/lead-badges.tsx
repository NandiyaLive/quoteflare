import type { LeadPlatform, LeadStatus } from '#/db/schema'
import { LEAD_PLATFORM_LABELS, LEAD_STATUS_LABELS } from '#/lib/leads'
import { Badge } from '@/components/ui/badge'

export const PlatformBadge = ({ platform }: { platform: LeadPlatform }) => (
  <Badge variant="outline">{LEAD_PLATFORM_LABELS[platform]}</Badge>
)

export const StatusBadge = ({ status }: { status: LeadStatus }) => (
  <Badge
    variant={status === 'won' || status === 'closed' ? 'outline' : 'secondary'}
  >
    {LEAD_STATUS_LABELS[status]}
  </Badge>
)
