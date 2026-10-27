import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  CURRENCIES,
  settingsSchema,
  type SettingsFormValues,
} from '#/lib/settings'
import { updateSettings } from '#/server/settings-actions'

type FieldName = keyof SettingsFormValues

export function SettingsForm({ initial }: { initial: SettingsFormValues }) {
  const router = useRouter()
  const [saved, setSaved] = useState(false)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})

  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: settingsSchema },
    onSubmit: async ({ value }) => {
      setSaved(false)
      setServerErrors({})
      const result = await updateSettings({ data: value })
      if (result.ok) {
        setSaved(true)
        await router.invalidate()
        return
      }
      setServerErrors(result.errors)
    },
  })

  const fieldErrors = (
    name: string,
    errors: Array<{ message?: string } | undefined>,
  ) =>
    serverErrors[name] ? [...errors, { message: serverErrors[name] }] : errors

  const currencies = CURRENCIES.includes(initial.currency as never)
    ? [...CURRENCIES]
    : [initial.currency, ...CURRENCIES]

  const text = (
    name: FieldName,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
    description?: string,
  ) => (
    <form.Field name={name}>
      {(field) => {
        const errors = fieldErrors(field.name, field.state.meta.errors)
        const invalid = errors.length > 0
        return (
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
            <Input
              id={field.name}
              name={field.name}
              value={field.state.value}
              aria-invalid={invalid}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              {...props}
            />
            {description && <FieldDescription>{description}</FieldDescription>}
            {invalid && <FieldError errors={errors} />}
          </Field>
        )
      }}
    </form.Field>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business details</CardTitle>
        <CardDescription>
          These appear on your invoices and set the defaults for new ones.
        </CardDescription>
      </CardHeader>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <CardContent>
          <FieldGroup>
            {text('businessName', 'Business name', {
              autoComplete: 'organization',
            })}
            <form.Field name="address">
              {(field) => {
                const errors = fieldErrors(field.name, field.state.meta.errors)
                const invalid = errors.length > 0
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor="address">Address</FieldLabel>
                    <Textarea
                      id="address"
                      name="address"
                      rows={3}
                      value={field.state.value}
                      aria-invalid={invalid}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    {invalid && <FieldError errors={errors} />}
                  </Field>
                )
              }}
            </form.Field>
            {text('email', 'Email', { type: 'email', autoComplete: 'email' })}
            <form.Field name="currency">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="currency">Currency</FieldLabel>
                  <Select
                    value={field.state.value}
                    onValueChange={(v) => v && field.handleChange(v)}
                  >
                    <SelectTrigger id="currency" className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((code) => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </form.Field>
            {text(
              'taxRate',
              'Tax rate (%)',
              { inputMode: 'decimal', className: 'w-40' },
              'Default for new invoices, for example 15 or 7.5.',
            )}
            {text('invoicePrefix', 'Invoice prefix', { className: 'w-40' })}
            {text(
              'nextInvoiceNumber',
              'Next invoice number',
              { inputMode: 'numeric', className: 'w-40' },
              'Lowering this below a number already issued will cause a duplicate.',
            )}
            <form.Field name="paymentInstructions">
              {(field) => {
                const errors = fieldErrors(field.name, field.state.meta.errors)
                const invalid = errors.length > 0
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor="paymentInstructions">
                      Payment instructions
                    </FieldLabel>
                    <Textarea
                      id="paymentInstructions"
                      name="paymentInstructions"
                      rows={4}
                      value={field.state.value}
                      aria-invalid={invalid}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    <FieldDescription>
                      Shown on each invoice, for example bank details.
                    </FieldDescription>
                    {invalid && <FieldError errors={errors} />}
                  </Field>
                )
              }}
            </form.Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="gap-3">
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(submitting) => (
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : 'Save settings'}
              </Button>
            )}
          </form.Subscribe>
          {saved && (
            <p role="status" className="text-sm text-muted-foreground">
              Settings saved.
            </p>
          )}
        </CardFooter>
      </form>
    </Card>
  )
}
