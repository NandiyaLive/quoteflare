import { useState } from 'react'
import type { LeadCloseReason } from '#/db/schema'
import { leadCloseReasons } from '#/db/schema'
import { LEAD_CLOSE_REASON_LABELS } from '#/lib/leads'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function CloseLeadDialog({
  lead,
  onClose,
  onConfirm,
}: {
  lead: { id: string; handle: string } | null
  onClose: () => void
  onConfirm: (id: string, reason: LeadCloseReason) => Promise<unknown>
}) {
  return (
    <Dialog open={lead !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {lead && (
          <CloseForm lead={lead} onClose={onClose} onConfirm={onConfirm} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CloseForm({
  lead,
  onClose,
  onConfirm,
}: {
  lead: { id: string; handle: string }
  onClose: () => void
  onConfirm: (id: string, reason: LeadCloseReason) => Promise<unknown>
}) {
  const [reason, setReason] = useState<LeadCloseReason>('no_reply')
  const [busy, setBusy] = useState(false)
  return (
    <>
      <DialogHeader>
        <DialogTitle>Close {lead.handle}?</DialogTitle>
        <DialogDescription>
          The lead leaves your Today list. You can reopen it later.
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="lead-close-reason">Reason</FieldLabel>
        <Select
          value={reason}
          onValueChange={(value) => value && setReason(value)}
        >
          <SelectTrigger id="lead-close-reason" className="w-full">
            <SelectValue>{LEAD_CLOSE_REASON_LABELS[reason]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {leadCloseReasons.map((value) => (
              <SelectItem key={value} value={value}>
                {LEAD_CLOSE_REASON_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await onConfirm(lead.id, reason)
            setBusy(false)
            onClose()
          }}
        >
          Close lead
        </Button>
      </DialogFooter>
    </>
  )
}
