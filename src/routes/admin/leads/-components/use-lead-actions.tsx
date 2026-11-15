import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useConfirm } from '@/components/common/confirm-dialog'
import { callAction } from '#/lib/action-errors'
import type { LeadActionInput } from '#/lib/lead-inputs'
import { leadAction } from '#/server/leads-actions'

/**
 * Runs lifecycle actions for the leads pages. `run` resolves to true when the
 * server applied the action. A failure shows a toast. Render `dialog` once.
 */
export function useLeadActions() {
  const router = useRouter()
  const { confirm, dialog } = useConfirm()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const run = async (action: LeadActionInput) => {
    setPendingId(action.id)
    const result = await callAction(
      () => leadAction({ data: action }),
      'Could not update the lead. Try again.',
    )
    setPendingId(null)
    if (!result) return false
    if (!result.ok) toast.error(result.error)
    await router.invalidate()
    return result.ok
  }

  const closeAsNoReply = async (lead: { id: string; handle: string }) => {
    const ok = await confirm({
      title: `Close ${lead.handle} as no reply?`,
      description:
        'The lead leaves your Today list. You can reopen it from the leads page.',
      confirmLabel: 'Close as no reply',
    })
    if (ok) await run({ type: 'close', id: lead.id, reason: 'no_reply' })
  }

  return { run, closeAsNoReply, pendingId, dialog }
}
