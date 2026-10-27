import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { InvoiceStatus } from '#/db/schema'
import { EMAILABLE_STATUSES, INVOICE_TRANSITIONS } from '#/lib/invoices'
import {
  changeInvoiceStatusAction,
  sendInvoiceEmailAction,
} from '#/server/invoices-actions'
import { toast } from 'sonner'
import { callAction } from '#/lib/action-errors'

const ACTION_LABELS: Record<InvoiceStatus, (from: InvoiceStatus) => string> = {
  draft: () => 'Back to draft',
  sent: (from) => (from === 'paid' ? 'Undo paid' : 'Mark as sent'),
  paid: () => 'Mark as paid',
  overdue: () => 'Mark as overdue',
  void: () => 'Void',
}

export function InvoiceStatusActions({
  invoiceId,
  status,
  disabled = false,
}: {
  invoiceId: string
  status: InvoiceStatus
  disabled?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmVoid, setConfirmVoid] = useState(false)

  const change = async (next: InvoiceStatus) => {
    setBusy(true)
    try {
      const result = await callAction(
        () =>
          changeInvoiceStatusAction({ data: { id: invoiceId, status: next } }),
        'Could not update the invoice status. Try again.',
      )
      if (result?.ok) toast.success('Invoice status updated.')
      else if (result) toast.error(result.error)
      setConfirmVoid(false)
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    setBusy(true)
    try {
      const result = await callAction(
        () => sendInvoiceEmailAction({ data: { id: invoiceId } }),
        'Could not send the invoice email. Try again.',
      )
      if (result?.ok) toast.success(`Invoice emailed to ${result.to}.`)
      else if (result) toast.error(result.error)
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  const targets = INVOICE_TRANSITIONS[status]
  if (targets.length === 0) return null

  return (
    <>
      {EMAILABLE_STATUSES.includes(status) && (
        <Button
          type="button"
          disabled={busy || disabled}
          onClick={() => void send()}
        >
          {status === 'draft' ? 'Send to client' : 'Resend to client'}
        </Button>
      )}
      {targets.map((target) => (
        <Button
          key={target}
          type="button"
          variant={target === 'void' ? 'outline' : 'default'}
          disabled={busy || disabled}
          onClick={() =>
            target === 'void' ? setConfirmVoid(true) : void change(target)
          }
        >
          {ACTION_LABELS[target](status)}
        </Button>
      ))}
      <Dialog open={confirmVoid} onOpenChange={setConfirmVoid}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void this invoice?</DialogTitle>
            <DialogDescription>
              A voided invoice cannot be changed again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void change('void')}
            >
              Void invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
