import { CheckIcon, ExternalLinkIcon, MoreHorizontalIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { LeadStatus } from '#/db/schema'
import { fillLeadTemplate } from '#/lib/lead-templates'
import { STEP_ACTIONS, type LeadActionInput } from '#/lib/lead-inputs'
import { isOpenLead, messageLink, shouldOfferClose } from '#/lib/leads'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type SendLead = {
  id: string
  handle: string
  name: string
  platform: Parameters<typeof messageLink>[0]['platform']
  profileUrl: string
  status: LeadStatus
  followUps: number
  unseenChecks: number
}

type Phase = 'idle' | 'opened' | 'returned'

const lowerFirst = (value: string) =>
  value.charAt(0).toLowerCase() + value.slice(1)

/**
 * Actions for a lead that is due a message. One button copies the filled
 * template and opens the chat. When the user comes back to this tab, the card
 * asks whether they sent it and offers the lead's next step. Nothing changes
 * the lead's status until the user confirms.
 */
export function LeadSendActions({
  lead,
  children,
  template,
  maxFollowUps,
  busy,
  onAction,
  onCloseAsNoReply,
  onClose,
}: {
  lead: SendLead
  children: ReactNode
  template: string
  maxFollowUps: number
  busy: boolean
  onAction: (action: LeadActionInput) => void
  onCloseAsNoReply: () => void
  onClose: () => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const message = fillLeadTemplate(template, lead)
  const steps = STEP_ACTIONS[lead.status]
  const nextStep = steps[0]
  const offerClose = shouldOfferClose(lead, { leadMaxFollowUps: maxFollowUps })

  useEffect(() => {
    if (phase !== 'opened') return
    const back = () => {
      if (document.visibilityState === 'visible') setPhase('returned')
    }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [phase])

  const copyAndOpen = () => {
    // Open before awaiting anything so popup blockers keep the user gesture.
    window.open(
      messageLink(lead, message || undefined),
      '_blank',
      'noopener,noreferrer',
    )
    setPhase('opened')
    if (!message) return
    navigator.clipboard.writeText(message).then(
      () => toast.success('Message copied'),
      () => toast.error('Could not copy. Select the text and copy it by hand.'),
    )
  }

  const returned = phase === 'returned' && nextStep

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-32">{children}</div>
        {returned ? (
          <div className="flex shrink-0 gap-2">
            <Button
              className="max-sm:min-h-11"
              disabled={busy}
              onClick={() => onAction({ type: nextStep.type, id: lead.id })}
            >
              <CheckIcon />
              Yes, {lowerFirst(nextStep.label)}
            </Button>
            <Button
              variant="outline"
              className="max-sm:min-h-11"
              onClick={() => setPhase('idle')}
            >
              Not yet
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 gap-2">
            {offerClose && (
              <Button
                className="max-sm:min-h-11"
                disabled={busy}
                onClick={onCloseAsNoReply}
              >
                Close as no reply
              </Button>
            )}
            <Button
              variant={offerClose ? 'outline' : 'default'}
              className="max-sm:min-h-11"
              onClick={copyAndOpen}
            >
              <ExternalLinkIcon />
              Chat
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    className="max-sm:size-11"
                    aria-label={`More actions for ${lead.handle}`}
                    disabled={busy}
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {steps.map((step) => (
                  <DropdownMenuItem
                    key={step.type}
                    onClick={() => onAction({ type: step.type, id: lead.id })}
                  >
                    {step.label}
                  </DropdownMenuItem>
                ))}
                {offerClose || !isOpenLead(lead.status) ? null : (
                  <DropdownMenuItem onClick={onCloseAsNoReply}>
                    Close as no reply
                  </DropdownMenuItem>
                )}
                {isOpenLead(lead.status) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={onClose}>
                      Drop lead
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      {returned ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          Did you send the message to {lead.handle}?
        </p>
      ) : (
        message && (
          <p className="line-clamp-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            {message}
          </p>
        )
      )}
    </div>
  )
}
