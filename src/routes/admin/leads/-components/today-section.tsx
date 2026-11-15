import { Link } from '@tanstack/react-router'
import {
  daysSince,
  groupTodayLeads,
  isOverdue,
  type LeadActionInput,
} from '#/lib/lead-inputs'
import { localToday } from '#/lib/leads'
import type { LeadRow } from '#/server/leads'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { LeadActionButtons } from './lead-action-buttons'
import { LeadSendActions } from './lead-send-actions'

export const lastContactLabel = (lead: LeadRow, today: string) => {
  if (!lead.lastContactedAt) return 'Not contacted yet'
  const days = daysSince(localToday(new Date(lead.lastContactedAt)), today)
  if (days === 0) return 'Contacted today'
  return `Contacted ${days} ${days === 1 ? 'day' : 'days'} ago`
}

export function TodaySection({
  leads,
  today,
  maxFollowUps,
  templates,
  pendingId,
  onAction,
  onCloseAsNoReply,
  onClose,
}: {
  leads: LeadRow[]
  today: string
  maxFollowUps: number
  templates: { opener: string; followUp: string }
  pendingId: string | null
  onAction: (action: LeadActionInput) => void
  onCloseAsNoReply: (lead: LeadRow) => void
  onClose: (lead: LeadRow) => void
}) {
  const groups = groupTodayLeads(leads, today)
  const total = groups.reduce((sum, group) => sum + group.leads.length, 0)

  return (
    <section className="flex flex-col gap-4" aria-labelledby="leads-today">
      <div className="flex items-center gap-2">
        <h2 id="leads-today" className="text-xl font-semibold tracking-tight">
          Today
        </h2>
        <Badge variant={total === 0 ? 'secondary' : 'default'}>
          {total === 0 ? 'Nothing due' : `${total} due`}
        </Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {groups.map((group) => (
          <Card key={group.id} size="sm">
            <CardHeader className="items-center">
              <CardTitle>{group.title}</CardTitle>
              <CardAction className="text-2xl font-semibold tabular-nums">
                {group.leads.length}
              </CardAction>
            </CardHeader>
            <CardContent>
              {group.leads.length === 0 ? (
                <p className="text-xs text-muted-foreground">{group.empty}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {group.leads.map((lead) => (
                    <li key={lead.id}>
                      <Card size="sm">
                        <CardContent className="flex flex-col gap-3">
                          {group.id === 'first_message' ||
                          group.id === 'follow_up' ? (
                            <LeadSendActions
                              lead={lead}
                              template={
                                group.id === 'first_message'
                                  ? templates.opener
                                  : templates.followUp
                              }
                              maxFollowUps={maxFollowUps}
                              busy={pendingId === lead.id}
                              onAction={onAction}
                              onCloseAsNoReply={() => onCloseAsNoReply(lead)}
                              onClose={() => onClose(lead)}
                            >
                              <div className="flex flex-col gap-0.5">
                                <p className="truncate font-medium">
                                  {lead.name || lead.handle}
                                </p>
                                <Link
                                  to="/admin/leads/$leadId"
                                  params={{ leadId: lead.id }}
                                  className="truncate text-xs text-muted-foreground underline-offset-4 hover:underline"
                                >
                                  {lead.handle}
                                </Link>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span>{lastContactLabel(lead, today)}</span>
                                  {isOverdue(lead, today) && (
                                    <Badge variant="destructive">Overdue</Badge>
                                  )}
                                </div>
                              </div>
                            </LeadSendActions>
                          ) : (
                            <>
                              <div className="flex flex-col gap-0.5">
                                <p className="truncate font-medium">
                                  {lead.name || lead.handle}
                                </p>
                                <Link
                                  to="/admin/leads/$leadId"
                                  params={{ leadId: lead.id }}
                                  className="truncate text-xs text-muted-foreground underline-offset-4 hover:underline"
                                >
                                  {lead.handle}
                                </Link>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span>{lastContactLabel(lead, today)}</span>
                                  {isOverdue(lead, today) && (
                                    <Badge variant="destructive">Overdue</Badge>
                                  )}
                                </div>
                              </div>
                              <LeadActionButtons
                                lead={lead}
                                maxFollowUps={maxFollowUps}
                                busy={pendingId === lead.id}
                                onAction={onAction}
                                onCloseAsNoReply={() => onCloseAsNoReply(lead)}
                                onClose={() => onClose(lead)}
                              />
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
