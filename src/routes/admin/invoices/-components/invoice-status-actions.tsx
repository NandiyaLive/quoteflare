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
import { INVOICE_TRANSITIONS } from '#/lib/invoices'
import { changeInvoiceStatusAction } from '#/server/invoices-actions'

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
  const [error, setError] = useState<string | null>(null)
  const [confirmVoid, setConfirmVoid] = useState(false)

  const change = async (next: InvoiceStatus) => {
    setBusy(true)
    setError(null)
    try {
      const result = await changeInvoiceStatusAction({
        data: { id: invoiceId, status: next },
      })
      if (!result.ok) setError(result.error)
      setConfirmVoid(false)
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  const targets = INVOICE_TRANSITIONS[status]
  if (targets.length === 0) return null

  return (
    <>
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
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
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
