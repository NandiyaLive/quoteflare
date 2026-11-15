import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { callAction, toastFormErrors } from '#/lib/action-errors'
import { leadDetailsSchema } from '#/lib/lead-inputs'
import { updateLeadDetailsAction } from '#/server/leads-actions'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function LeadDetailsForm({
  lead,
}: {
  lead: { id: string; name: string; note: string }
}) {
  const router = useRouter()
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})

  const form = useForm({
    defaultValues: { id: lead.id, name: lead.name, note: lead.note },
    validators: { onSubmit: leadDetailsSchema },
    onSubmit: async ({ value }) => {
      setServerErrors({})
      const result = await callAction(
        () => updateLeadDetailsAction({ data: value }),
        'Could not save the lead. Try again.',
      )
      if (!result) return
      if (result.ok) {
        toast.success('Lead saved.')
        await router.invalidate()
        return
      }
      setServerErrors(result.errors)
      toastFormErrors(result.errors)
    },
  })

  const field = (name: 'name' | 'note', label: string, multiline = false) => (
    <form.Field name={name}>
      {(f) => {
        const errors = serverErrors[name]
          ? [...f.state.meta.errors, { message: serverErrors[name] }]
          : f.state.meta.errors
        const invalid = errors.length > 0
        const shared = {
          id: `lead-${name}`,
          name,
          value: f.state.value,
          'aria-invalid': invalid,
          onBlur: f.handleBlur,
          onChange: (
            e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
          ) => f.handleChange(e.target.value),
        }
        return (
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor={shared.id}>{label}</FieldLabel>
            {multiline ? (
              <Textarea {...shared} rows={4} />
            ) : (
              <Input {...shared} autoComplete="off" />
            )}
            {invalid && <FieldError errors={errors} />}
          </Field>
        )
      }}
    </form.Field>
  )

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        {field('name', 'Name')}
        {field('note', 'Note', true)}
      </FieldGroup>
      <form.Subscribe selector={(s) => [s.isSubmitting, s.isDirty] as const}>
        {([submitting, dirty]) => (
          <Button
            type="submit"
            className="self-start"
            disabled={submitting || !dirty}
          >
            {submitting ? 'Saving...' : 'Save details'}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}
