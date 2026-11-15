import { useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { callAction } from '#/lib/action-errors'
import { parseProfileUrl } from '#/lib/leads'
import { saveLeadAction } from '#/server/leads-actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

/** Saves a lead from a pasted link, shared text or @handle. */
export function AddLeadDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>{open && <AddLeadForm onDone={onClose} />}</DialogContent>
    </Dialog>
  )
}

function AddLeadForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const router = useRouter()
  const [input, setInput] = useState('')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const parsed = parseProfileUrl(input)
  const shownError = error ?? (input.trim() && !parsed.ok ? parsed.error : null)

  const submit = async () => {
    setError(null)
    setBusy(true)
    const result = await callAction(
      () => saveLeadAction({ data: { input, name, note } }),
      'Could not save the lead. Try again.',
    )
    setBusy(false)
    if (!result) return
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(result.existing ? 'Already saved.' : 'Lead saved.')
    onDone()
    if (result.existing) {
      await navigate({
        to: '/admin/leads/$leadId',
        params: { leadId: result.id },
      })
    } else {
      await router.invalidate()
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>Add lead</DialogTitle>
        <DialogDescription>
          Paste a profile link or type an @handle.
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={shownError !== null}>
        <FieldLabel htmlFor="add-lead-input">
          Profile link or @handle
        </FieldLabel>
        <Input
          id="add-lead-input"
          autoComplete="off"
          placeholder="https://www.instagram.com/handle or @handle"
          value={input}
          aria-invalid={shownError !== null}
          onChange={(e) => {
            setInput(e.target.value)
            setError(null)
          }}
        />
        {shownError && <FieldError errors={[{ message: shownError }]} />}
      </Field>
      <Field>
        <FieldLabel htmlFor="add-lead-name">Name (optional)</FieldLabel>
        <Input
          id="add-lead-name"
          autoComplete="off"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="add-lead-note">Note (optional)</FieldLabel>
        <Textarea
          id="add-lead-note"
          maxLength={5000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !parsed.ok}>
          {busy ? 'Saving...' : 'Save lead'}
        </Button>
      </DialogFooter>
    </form>
  )
}
