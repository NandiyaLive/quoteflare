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
import { Checkbox } from '@/components/ui/checkbox'
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

type FieldName = Exclude<keyof SettingsFormValues, 'sendReminders'>

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
        className="flex flex-col gap-(--card-spacing)"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <CardContent>
          <FieldGroup className="md:grid md:grid-cols-2">
            {text('businessName', 'Business name', {
              autoComplete: 'organization',
            })}
            {text('email', 'Email', { type: 'email', autoComplete: 'email' })}
            {text(
              'replyToEmail',
              'Reply-to email',
              { type: 'email' },
              'Replies to invoice emails go here.',
            )}
            <form.Field name="address">
              {(field) => {
                const errors = fieldErrors(field.name, field.state.meta.errors)
                const invalid = errors.length > 0
                return (
                  <Field data-invalid={invalid} className="md:col-span-2">
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
            <form.Field name="currency">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="currency">Currency</FieldLabel>
                  <Select
                    value={field.state.value}
                    onValueChange={(v) => v && field.handleChange(v)}
                  >
                    <SelectTrigger id="currency" className="w-full">
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
              { inputMode: 'decimal' },
              'Default for new invoices, for example 15 or 7.5.',
            )}
            {text('invoicePrefix', 'Invoice prefix', {})}
            {text(
              'nextInvoiceNumber',
              'Next invoice number',
              { inputMode: 'numeric' },
              'Lowering this below a number already issued will cause a duplicate.',
            )}
            {text(
              'paymentTermDays',
              'Payment term (days)',
              { inputMode: 'numeric' },
              'Days between the issue date and the due date on recurring invoices.',
            )}
            <form.Field name="paymentInstructions">
              {(field) => {
                const errors = fieldErrors(field.name, field.state.meta.errors)
                const invalid = errors.length > 0
                return (
                  <Field data-invalid={invalid} className="md:col-span-2">
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
            <form.Field name="sendReminders">
              {(field) => (
                <Field orientation="horizontal" className="md:col-span-2">
                  <Checkbox
                    id="sendReminders"
                    name="sendReminders"
                    checked={field.state.value}
                    onCheckedChange={(checked) =>
                      field.handleChange(checked === true)
                    }
                  />
                  <div className="flex flex-col gap-1">
                    <FieldLabel htmlFor="sendReminders">
                      Send automatic reminders
                    </FieldLabel>
                    <FieldDescription>
                      Emails the client 3 days before the due date and 3 and 10
                      days after it, once each.
                    </FieldDescription>
                  </div>
                </Field>
              )}
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
