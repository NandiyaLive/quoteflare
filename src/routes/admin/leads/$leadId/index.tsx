import {
  createFileRoute,
  Link,
  notFound,
  useRouter,
} from '@tanstack/react-router'
import { useState } from 'react'
import { ExternalLinkIcon } from 'lucide-react'
import BackButton from '@/components/common/back-button'
import PageHeader from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/format'
import {
  isOpenLead,
  leadClientPrefill,
  LEAD_CLOSE_REASON_LABELS,
  LEAD_EVENT_LABELS,
} from '#/lib/leads'
import { getLeadDetail } from '#/server/leads-actions'
import { ClientDialog } from '../../clients/-components/client-dialog'
import { CloseLeadDialog } from '../-components/close-lead-dialog'
import { LeadActionButtons } from '../-components/lead-action-buttons'
import { LeadDetailsForm } from '../-components/lead-details-form'
import { PlatformBadge, StatusBadge } from '../-components/lead-badges'
import { useLeadActions } from '../-components/use-lead-actions'

export const Route = createFileRoute('/admin/leads/$leadId/')({
  staticData: { breadcrumb: 'Lead' },
  loader: async ({ params }) => {
    const detail = await getLeadDetail({ data: params.leadId })
    if (!detail) throw notFound()
    return { ...detail, crumb: detail.lead.handle }
  },
  notFoundComponent: () => (
    <p className="text-muted-foreground">This lead does not exist.</p>
  ),
  component: LeadPage,
})

const formatStamp = (iso: string) =>
  formatDate(iso, {
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Colombo',
  })

function LeadPage() {
  const { lead, client, quote, events, maxFollowUps } = Route.useLoaderData()
  const router = useRouter()
  const { run, closeAsNoReply, pendingId, dialog } = useLeadActions()
  const [closing, setClosing] = useState(false)
  const [makingClient, setMakingClient] = useState(false)
  const [date, setDate] = useState(lead.nextActionOn ?? '')
  const busy = pendingId === lead.id

  return (
    <>
      <PageHeader
        back={
          <BackButton link={<Link to="/admin/leads" />}>
            Back to leads
          </BackButton>
        }
        title={lead.handle}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <PlatformBadge platform={lead.platform} />
            <StatusBadge status={lead.status} />
            {lead.closeReason && LEAD_CLOSE_REASON_LABELS[lead.closeReason]}
          </span>
        }
      >
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <a
              href={lead.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          <ExternalLinkIcon />
          Open profile
        </Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Next step</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {lead.nextActionOn
              ? `Next action ${formatDate(lead.nextActionOn, { timeZone: 'UTC' })}.`
              : 'No next action.'}{' '}
            Follow-ups sent: {lead.followUps} of {maxFollowUps}. Not-seen
            checks: {lead.unseenChecks}.
          </p>
          <LeadActionButtons
            lead={lead}
            maxFollowUps={maxFollowUps}
            busy={busy}
            onAction={(action) => void run(action)}
            onCloseAsNoReply={() => void closeAsNoReply(lead)}
            onClose={() => setClosing(true)}
          />
          {lead.status === 'replied' && !lead.clientId && (
            <div>
              <Button disabled={busy} onClick={() => setMakingClient(true)}>
                Make client
              </Button>
            </div>
          )}
          {lead.status === 'replied' && lead.clientId && !lead.quoteId && (
            <div>
              <Button
                nativeButton={false}
                render={
                  <Link
                    to="/admin/quotes/new"
                    search={{ clientId: lead.clientId, leadId: lead.id }}
                  />
                }
              >
                Create quote
              </Button>
            </div>
          )}
          {!isOpenLead(lead.status) && (
            <div>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void run({ type: 'reopen', id: lead.id })}
              >
                Reopen
              </Button>
            </div>
          )}
          {isOpenLead(lead.status) && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (date) void run({ type: 'reschedule', id: lead.id, date })
              }}
            >
              <Field className="w-auto">
                <FieldLabel htmlFor="lead-reschedule">Reschedule</FieldLabel>
                <Input
                  id="lead-reschedule"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Button
                type="submit"
                variant="outline"
                disabled={busy || !date || date === lead.nextActionOn}
              >
                Reschedule
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {(client || quote) && (
        <Card>
          <CardHeader>
            <CardTitle>Client and quote</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {client && (
              <p>
                Client:{' '}
                <Link
                  to="/admin/clients/$clientId"
                  params={{ clientId: client.id }}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {client.name}
                </Link>
                {client.archived && ' (archived)'}
              </p>
            )}
            {quote && (
              <p>
                Quote:{' '}
                <Link
                  to="/admin/quotes/$quoteId"
                  params={{ quoteId: quote.id }}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {quote.number ?? 'Quote'}
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <LeadDetailsForm lead={lead} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-3">
              {events.map((event) => (
                <li key={event.id} className="flex flex-col text-sm">
                  <span className="font-medium">
                    {LEAD_EVENT_LABELS[event.type]}
                    {event.detail && (
                      <span className="font-normal text-muted-foreground">
                        {' '}
                        {event.type === 'closed'
                          ? (LEAD_CLOSE_REASON_LABELS[
                              event.detail as keyof typeof LEAD_CLOSE_REASON_LABELS
                            ] ?? event.detail)
                          : event.detail}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {formatStamp(event.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <CloseLeadDialog
        lead={closing ? lead : null}
        onClose={() => setClosing(false)}
        onConfirm={async (id, reason) => {
          const ok = await run({ type: 'close', id, reason })
          if (ok) await router.invalidate()
        }}
      />
      <ClientDialog
        open={makingClient}
        client={leadClientPrefill(lead)}
        leadId={lead.id}
        onClose={() => setMakingClient(false)}
      />
      {dialog}
    </>
  )
}
