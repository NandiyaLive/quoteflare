import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/format'
import { formatMinor } from '#/lib/decimal'
import type { InvoiceAdvance } from '#/lib/invoices'
import type { InvoiceStatus } from '#/db/schema'
import { setAdvancePaidAction } from '#/server/invoices-actions'
import { toast } from 'sonner'
import { callAction } from '#/lib/action-errors'

export function AdvancePaymentCard({
  invoiceId,
  status,
  currency,
  advance,
}: {
  invoiceId: string
  status: InvoiceStatus
  currency: string
  advance: InvoiceAdvance
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const canChange = status === 'sent' || status === 'overdue'
  const amount = formatMinor(advance.advanceAmount, currency)

  const toggle = async () => {
    setBusy(true)
    try {
      const result = await callAction(
        () =>
          setAdvancePaidAction({
            data: { id: invoiceId, paid: !advance.paidAt },
          }),
        'Could not update the advance payment. Try again.',
      )
      if (!result) return
      if (result.ok) {
        toast.success(
          result.paidAt ? 'Advance marked as paid.' : 'Advance marked unpaid.',
        )
      } else toast.error(result.error)
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Advance payment</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p data-testid="advance-status">
          {advance.paidAt
            ? `${amount} paid on ${formatDate(advance.paidAt)}.`
            : `${amount} is due before the work starts.`}
        </p>
        {canChange ? (
          <Button
            variant={advance.paidAt ? 'outline' : 'default'}
            disabled={busy}
            onClick={() => void toggle()}
          >
            {advance.paidAt ? 'Undo advance paid' : 'Mark advance as paid'}
          </Button>
        ) : (
          <p className="text-muted-foreground">
            Send the invoice to record the advance payment.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
