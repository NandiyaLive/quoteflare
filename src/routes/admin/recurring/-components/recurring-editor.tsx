import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import BackButton from '@/components/common/back-button'
import PageHeader from '@/components/common/page-header'
import { SearchSelect } from '@/components/common/search-select'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { emptyInvoiceItem, todayIso } from '#/lib/invoices'
import {
  MAX_RECURRING_ITEMS,
  RECURRING_INTERVAL_LABELS,
  recurringSchema,
  type RecurringFormValues,
} from '#/lib/recurring'
import { recurringIntervals } from '#/db/schema'
import type { QuoteSchedulePrefill } from '#/server/quotes'
import {
  getRecurringFormContext,
  saveScheduleAction,
} from '#/server/recurring-actions'
import { toast } from 'sonner'
import { callAction, toastFormErrors } from '#/lib/action-errors'
import { cn } from '@/lib/utils'

type Context = Awaited<ReturnType<typeof getRecurringFormContext>>

export function RecurringEditor({
  context,
  schedule,
  prefill = null,
}: {
  context: Context
  schedule: RecurringFormValues | null
  prefill?: QuoteSchedulePrefill | null
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})

  const form = useForm({
    defaultValues: schedule ??
      prefill?.values ?? {
        clientId: '',
        interval: 'monthly' as RecurringFormValues['interval'],
        nextRunDate: todayIso(),
        autoSend: false,
        items: [{ ...emptyInvoiceItem }],
      },
    validators: { onSubmit: recurringSchema },
    onSubmit: async ({ value }) => {
      setServerErrors({})
      const result = await callAction(
        () =>
          saveScheduleAction({
            data:
              prefill && !value.clientId
                ? { ...value, quoteId: prefill.quoteId }
                : value,
          }),
        'Could not save the schedule. Try again.',
      )
      if (!result) return
      if (!result.ok) {
        setServerErrors(result.errors)
        toastFormErrors(result.errors)
        return
      }
      if (schedule) {
        toast.success('Schedule saved.')
        await router.invalidate()
        return
      }
      await navigate({ to: '/admin/recurring' })
    },
  })

  const withServerError = (
    key: string,
    errors: Array<{ message?: string } | undefined>,
  ) =>
    serverErrors[key] ? [...errors, { message: serverErrors[key] }] : errors

  const clients = context.clients

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <PageHeader
        back={
          <BackButton link={<Link to="/admin/recurring" />}>
            Back to recurring
          </BackButton>
        }
        title={schedule ? 'Edit schedule' : 'New schedule'}
        description="The daily job creates an invoice from these lines when the next run date arrives."
      >
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(submitting) => (
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save schedule'}
            </Button>
          )}
        </form.Subscribe>
      </PageHeader>

      {prefill && (
        <p className="rounded-lg border p-3 text-sm" role="note">
          Prefilled from the quote by {prefill.contactName} (
          {prefill.contactEmail}).{' '}
          {prefill.clientMissing
            ? 'No client has that email, so one will be created from the quote contact unless you choose another.'
            : 'Review the lines and the first run date before saving.'}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="md:grid md:grid-cols-2">
            <form.Field name="clientId">
              {(field) => {
                const errors = withServerError(
                  'clientId',
                  field.state.meta.errors,
                )
                const invalid = errors.length > 0
                const selected = clients.find((c) => c.id === field.state.value)
                return (
                  <Field data-invalid={invalid} className="md:col-span-2">
                    <FieldLabel htmlFor="recurring-clientId">Client</FieldLabel>
                    <SearchSelect
                      id="recurring-clientId"
                      value={field.state.value}
                      invalid={invalid}
                      placeholder={
                        field.state.value && !selected
                          ? 'Archived client'
                          : prefill?.clientMissing
                            ? `New client: ${prefill.contactName}`
                            : 'Choose a client'
                      }
                      emptyText="No clients found."
                      options={clients.map((c) => ({
                        value: c.id,
                        label: c.company ? `${c.name} (${c.company})` : c.name,
                      }))}
                      onValueChange={field.handleChange}
                    />
                    {invalid && <FieldError errors={errors} />}
                  </Field>
                )
              }}
            </form.Field>
            <form.Field name="interval">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="recurring-interval">Interval</FieldLabel>
                  <Select
                    value={field.state.value}
                    onValueChange={(v) => v && field.handleChange(v)}
                  >
                    <SelectTrigger id="recurring-interval" className="w-full">
                      <SelectValue>
                        {RECURRING_INTERVAL_LABELS[field.state.value]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {recurringIntervals.map((value) => (
                        <SelectItem key={value} value={value}>
                          {RECURRING_INTERVAL_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </form.Field>
            <form.Field name="nextRunDate">
              {(field) => {
                const errors = withServerError(
                  'nextRunDate',
                  field.state.meta.errors,
                )
                const invalid = errors.length > 0
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor="recurring-nextRunDate">
                      {schedule ? 'Next run date' : 'First run date'}
                    </FieldLabel>
                    <Input
                      id="recurring-nextRunDate"
                      type="date"
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
            <form.Field name="autoSend">
              {(field) => (
                <Field orientation="horizontal" className="md:col-span-2">
                  <Checkbox
                    id="recurring-autoSend"
                    checked={field.state.value}
                    onCheckedChange={(checked) =>
                      field.handleChange(checked === true)
                    }
                  />
                  <div className="flex flex-col gap-1">
                    <FieldLabel htmlFor="recurring-autoSend">
                      Send automatically
                    </FieldLabel>
                    <FieldDescription>
                      Emails each new invoice to the client. When off, the
                      invoice stays a draft.
                    </FieldDescription>
                  </div>
                </Field>
              )}
            </form.Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
          <CardDescription>
            Copied onto every invoice this schedule creates, in{' '}
            {context.currency}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form.Field name="items" mode="array">
            {(itemsField) => {
              const listErrors = withServerError(
                'items',
                itemsField.state.meta.errors,
              )
              return (
                <div className="flex flex-col gap-4">
                  {itemsField.state.value.map((_, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-start gap-3 rounded-lg border p-3"
                      data-testid="recurring-line"
                    >
                      {(
                        [
                          ['description', 'Description', {}],
                          [
                            'quantity',
                            'Qty',
                            { inputMode: 'numeric' as const },
                          ],
                          [
                            'unitPrice',
                            'Unit price',
                            { inputMode: 'decimal' as const },
                          ],
                        ] as const
                      ).map(([key, label, props]) => (
                        <form.Field key={key} name={`items[${index}].${key}`}>
                          {(field) => {
                            const errors = withServerError(
                              `items.${index}.${key}`,
                              field.state.meta.errors,
                            )
                            const invalid = errors.length > 0
                            return (
                              <Field
                                data-invalid={invalid}
                                className={cn(
                                  key === 'description' && 'col-span-full',
                                )}
                              >
                                <FieldLabel
                                  htmlFor={`recurring-item-${index}-${key}`}
                                >
                                  {label}
                                </FieldLabel>
                                <Input
                                  id={`recurring-item-${index}-${key}`}
                                  placeholder={label}
                                  value={field.state.value}
                                  aria-invalid={invalid}
                                  onBlur={field.handleBlur}
                                  onChange={(e) =>
                                    field.handleChange(e.target.value)
                                  }
                                  {...props}
                                />
                                {invalid && <FieldError errors={errors} />}
                              </Field>
                            )
                          }}
                        </form.Field>
                      ))}
                      <Field>
                        <FieldLabel aria-hidden className="invisible">
                          Remove
                        </FieldLabel>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove line ${index + 1}`}
                          onClick={() => itemsField.removeValue(index)}
                        >
                          <Trash2Icon />
                        </Button>
                      </Field>
                      <form.Field name={`items[${index}].taxable`}>
                        {(field) => (
                          <Field
                            orientation="horizontal"
                            className="col-span-full"
                          >
                            <Checkbox
                              id={`recurring-item-${index}-taxable`}
                              checked={field.state.value ?? true}
                              onCheckedChange={(checked) =>
                                field.handleChange(checked)
                              }
                            />
                            <FieldLabel
                              htmlFor={`recurring-item-${index}-taxable`}
                            >
                              Taxable
                            </FieldLabel>
                          </Field>
                        )}
                      </form.Field>
                    </div>
                  ))}
                  {listErrors.length > 0 && <FieldError errors={listErrors} />}
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        itemsField.state.value.length >= MAX_RECURRING_ITEMS
                      }
                      onClick={() =>
                        itemsField.pushValue({ ...emptyInvoiceItem })
                      }
                    >
                      <PlusIcon />
                      Add line
                    </Button>
                  </div>
                </div>
              )
            }}
          </form.Field>
        </CardContent>
      </Card>
    </form>
  )
}
