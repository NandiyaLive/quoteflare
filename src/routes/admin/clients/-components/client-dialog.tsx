import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { clientSchema, emptyClient, type ClientFormValues } from '#/lib/clients'
import { saveClientAction } from '#/server/clients-actions'
import { toast } from 'sonner'
import { callAction, toastFormErrors } from '#/lib/action-errors'

export function ClientDialog({
  open,
  client,
  onClose,
}: {
  open: boolean
  client: ClientFormValues | null
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {open && (
          <ClientForm initial={client ?? emptyClient} onDone={onClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ClientForm({
  initial,
  onDone,
}: {
  initial: ClientFormValues
  onDone: () => void
}) {
  const router = useRouter()
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})

  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: clientSchema },
    onSubmit: async ({ value }) => {
      setServerErrors({})
      const result = await callAction(
        () => saveClientAction({ data: value }),
        'Could not save the client. Try again.',
      )
      if (!result) return
      if (result.ok) {
        toast.success('Client saved.')
        await router.invalidate()
        onDone()
        return
      }
      setServerErrors(result.errors)
      toastFormErrors(result.errors)
    },
  })

  const text = (
    name: Exclude<keyof ClientFormValues, 'id'>,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
    multiline = false,
  ) => (
    <form.Field name={name}>
      {(field) => {
        const errors = serverErrors[name]
          ? [...field.state.meta.errors, { message: serverErrors[name] }]
          : field.state.meta.errors
        const invalid = errors.length > 0
        const shared = {
          id: `client-${name}`,
          name,
          value: field.state.value,
          'aria-invalid': invalid,
          onBlur: field.handleBlur,
        }
        return (
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor={shared.id}>{label}</FieldLabel>
            {multiline ? (
              <Textarea
                {...shared}
                rows={3}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            ) : (
              <Input
                {...shared}
                onChange={(e) => field.handleChange(e.target.value)}
                {...props}
              />
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
      <DialogHeader>
        <DialogTitle>{initial.id ? 'Edit client' : 'New client'}</DialogTitle>
        <DialogDescription>
          Clients can be picked when you create an invoice.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        {text('name', 'Name', { autoComplete: 'off' })}
        {text('company', 'Company', { autoComplete: 'off' })}
        {text('email', 'Email', { type: 'email', autoComplete: 'off' })}
        {text('address', 'Address', {}, true)}
        {text('notes', 'Notes', {}, true)}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(submitting) => (
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save client'}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}
