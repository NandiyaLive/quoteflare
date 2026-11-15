import { useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { callAction } from '#/lib/action-errors'
import { saveLeadAction } from '#/server/leads-actions'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

/** Saves a profile from a pasted link, shared text or @handle. */
export function PasteLinkForm() {
  const navigate = useNavigate()
  const router = useRouter()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError(null)
    setBusy(true)
    const result = await callAction(
      () => saveLeadAction({ data: { input: value } }),
      'Could not save the lead. Try again.',
    )
    setBusy(false)
    if (!result) return
    if (!result.ok) {
      setError(result.error)
      return
    }
    setValue('')
    toast.success(result.existing ? 'Already saved.' : 'Lead saved.')
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
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Field data-invalid={error !== null}>
        <FieldLabel htmlFor="lead-link">Paste a profile link</FieldLabel>
        <div className="flex flex-wrap gap-2">
          <Input
            id="lead-link"
            className="min-w-0 flex-1 basis-60"
            placeholder="https://www.instagram.com/handle or @handle"
            autoComplete="off"
            value={value}
            aria-invalid={error !== null}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="submit" disabled={busy || value.trim() === ''}>
            {busy ? 'Saving...' : 'Save lead'}
          </Button>
        </div>
        {error && <FieldError errors={[{ message: error }]} />}
      </Field>
    </form>
  )
}
