import type { LeadStatus } from '#/db/schema'
import { STEP_ACTIONS, type LeadActionInput } from '#/lib/lead-inputs'
import { isOpenLead, shouldOfferClose } from '#/lib/leads'
import { Button } from '@/components/ui/button'

type ButtonLead = {
  id: string
  handle: string
  status: LeadStatus
  followUps: number
  unseenChecks: number
}

/**
 * The action buttons for a lead's status. When the lead has used up its
 * follow-ups or unseen checks, "Close as no reply" is the main button and the
 * lifecycle steps stay available as outline buttons.
 */
export function LeadActionButtons({
  lead,
  maxFollowUps,
  busy,
  onAction,
  onCloseAsNoReply,
  onClose,
}: {
  lead: ButtonLead
  maxFollowUps: number
  busy: boolean
  onAction: (action: LeadActionInput) => void
  onCloseAsNoReply: () => void
  onClose: () => void
}) {
  const offerClose = shouldOfferClose(lead, {
    leadMaxFollowUps: maxFollowUps,
  })
  const steps = STEP_ACTIONS[lead.status]
  return (
    <div className="flex flex-wrap gap-2">
      {offerClose && (
        <Button disabled={busy} onClick={onCloseAsNoReply}>
          Close as no reply
        </Button>
      )}
      {steps.map((step, index) => (
        <Button
          key={step.type}
          variant={index === 0 && !offerClose ? 'default' : 'outline'}
          disabled={busy}
          onClick={() => onAction({ type: step.type, id: lead.id })}
        >
          {step.label}
        </Button>
      ))}
      {isOpenLead(lead.status) && (
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Close
        </Button>
      )}
    </div>
  )
}
