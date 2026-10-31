import { getQuoteConfig } from '#/server/quote-actions'
import { createFileRoute } from '@tanstack/react-router'
import { useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useForm } from '@tanstack/react-form'
import { format } from 'date-fns'
import { CheckCircle2Icon, DownloadIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Turnstile } from '@/components/common/turnstile'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { quoteFormSchema } from '#/lib/quotes'
import { submitQuoteAction } from '#/server/quote-actions'
import {
  clearSavedCalculator,
  useCalculator,
} from '../-components/calculator-context'
import { callAction } from '#/lib/action-errors'
import { bpsToPercent } from '#/lib/decimal'
import { BILLING_LABELS } from '#/lib/services'

export const Route = createFileRoute('/_site/_calculator/review/')({
  loader: () => getQuoteConfig(),
  component: ReviewPage,
})

const subscribeNothing = () => () => {}

function downloadPdf() {
  const root = document.documentElement
  root.setAttribute('data-printing-quote', '')
  window.addEventListener(
    'afterprint',
    () => root.removeAttribute('data-printing-quote'),
    { once: true },
  )
  window.print()
}

function ReviewPage() {
  const { turnstileSiteKey } = Route.useLoaderData()
  const { catalog, state, evaluation, displayCurrency, money } = useCalculator()
  const [token, setToken] = useState('')
  const [widgetKey, setWidgetKey] = useState(0)
  const [sent, setSent] = useState(false)
  // The print copy is portaled into document.body, which the server lacks.
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  )

  const selections = catalog.services.flatMap((service) => {
    const choice = state[service.id]
    if (!choice || evaluation.problems[service.id]) return []
    return [
      {
        serviceId: service.id,
        quantity: Number(choice.quantity),
        optionIds: choice.optionIds,
      },
    ]
  })
  const hasProblems = Object.keys(evaluation.problems).length > 0

  const form = useForm({
    defaultValues: { name: '', email: '', message: '', website: '' },
    validators: { onSubmit: quoteFormSchema },
    onSubmit: async ({ value }) => {
      if (!token) {
        toast.error('Complete the spam check.')
        return
      }
      const result = await callAction(
        () =>
          submitQuoteAction({
            data: {
              ...value,
              turnstileToken: token,
              selections,
              displayCurrency:
                displayCurrency === catalog.currency
                  ? undefined
                  : displayCurrency,
            },
          }),
        'Could not send your quote request. Try again.',
      )
      if (!result) {
        setToken('')
        setWidgetKey((key) => key + 1)
        return
      }
      if (result.ok) {
        toast.success('Quote request sent.')
        clearSavedCalculator()
        setSent(true)
        return
      }
      toast.error(result.error)
      setToken('')
      setWidgetKey((key) => key + 1)
    },
  })

  if (sent) {
    return (
      <Alert data-testid="quote-confirmation">
        <CheckCircle2Icon />
        <AlertTitle>Quote request sent</AlertTitle>
        <AlertDescription>
          Thank you. We sent a copy to your email address and will reply there.
        </AlertDescription>
      </Alert>
    )
  }

  const text = (
    name: 'name' | 'email',
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <form.Field name={name}>
      {(field) => {
        const errors = field.state.meta.errors
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
            {invalid && <FieldError errors={errors} />}
          </Field>
        )
      }}
    </form.Field>
  )

  const blocked =
    selections.length === 0 || hasProblems || turnstileSiteKey === ''

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request a quote</CardTitle>
        <CardDescription>
          Send your selection to us. We recalculate the price and reply by
          email.
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
          <FieldGroup>
            {selections.length === 0 && (
              <Alert>
                <AlertDescription>
                  Select at least one service on the Scope page first.
                </AlertDescription>
              </Alert>
            )}
            {hasProblems && (
              <Alert variant="destructive">
                <AlertDescription>
                  Fix the highlighted services on the Scope page before sending.
                </AlertDescription>
              </Alert>
            )}
            {text('name', 'Name', { autoComplete: 'name' })}
            {text('email', 'Email', { type: 'email', autoComplete: 'email' })}
            <form.Field name="message">
              {(field) => {
                const errors = field.state.meta.errors
                const invalid = errors.length > 0
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor="message">
                      Message (optional)
                    </FieldLabel>
                    <Textarea
                      id="message"
                      name="message"
                      rows={4}
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
            <form.Field name="website">
              {(field) => (
                <div aria-hidden="true" className="absolute left-[-9999px]">
                  <label htmlFor="website">Leave this field empty</label>
                  <input
                    id="website"
                    name="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>
            {turnstileSiteKey ? (
              <Turnstile
                siteKey={turnstileSiteKey}
                resetKey={widgetKey}
                onToken={setToken}
              />
            ) : (
              <Alert variant="destructive">
                <AlertDescription>
                  Quote requests are unavailable right now.
                </AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <form.Subscribe
            selector={(s) => ({
              submitting: s.isSubmitting,
              name: s.values.name.trim(),
              email: s.values.email.trim(),
            })}
          >
            {({ submitting, name, email }) => (
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={blocked || submitting}>
                  {submitting ? 'Sending...' : 'Send quote request'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={selections.length === 0 || !name || !email}
                  onClick={downloadPdf}
                >
                  <DownloadIcon data-icon="inline-start" />
                  Download PDF
                </Button>
                {hydrated &&
                  createPortal(
                    <div data-print-quote className="p-8 text-sm">
                      <h1 className="text-2xl font-semibold">Quote estimate</h1>
                      <p className="mt-2">
                        Prepared for {name} ({email})
                      </p>
                      <p className="text-muted-foreground">
                        {format(new Date(), 'd MMM yyyy')}
                      </p>
                      <table className="mt-6 w-full">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="py-2">Service</th>
                            <th className="py-2 text-right">Qty</th>
                            <th className="py-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {evaluation.breakdown.lines.map((line) => (
                            <tr key={line.serviceId} className="border-b">
                              <td className="py-2">{line.name}</td>
                              <td className="py-2 text-right">
                                {line.quantity}
                              </td>
                              <td className="py-2 text-right">
                                {money(line.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <dl className="mt-4 ml-auto flex w-64 flex-col gap-1">
                        <div className="flex justify-between">
                          <dt>Subtotal</dt>
                          <dd>{money(evaluation.breakdown.subtotal)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Tax ({bpsToPercent(catalog.taxRateBps)}%)</dt>
                          <dd>{money(evaluation.breakdown.taxAmount)}</dd>
                        </div>
                        <div className="flex justify-between text-base font-semibold">
                          <dt>Total</dt>
                          <dd>{money(evaluation.breakdown.total)}</dd>
                        </div>
                      </dl>
                      {evaluation.breakdown.recurring.lines.length > 0 && (
                        <div className="mt-6">
                          <p className="font-medium">Recurring charges</p>
                          <dl className="mt-2 flex flex-col gap-1">
                            {evaluation.breakdown.recurring.lines.map(
                              (line) => (
                                <div
                                  key={line.serviceId}
                                  className="flex justify-between"
                                >
                                  <dt>
                                    {line.name} (
                                    {BILLING_LABELS[line.billing].toLowerCase()}
                                    )
                                  </dt>
                                  <dd>{money(line.amount)}</dd>
                                </div>
                              ),
                            )}
                            <div className="flex justify-between font-medium">
                              <dt>Recurring total</dt>
                              <dd>
                                {money(evaluation.breakdown.recurring.total)}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      )}
                      {displayCurrency !== catalog.currency && (
                        <p className="mt-6 text-xs text-muted-foreground">
                          Converted from {catalog.currency} at today&apos;s
                          rate. The final quote is issued in {catalog.currency}.
                        </p>
                      )}
                    </div>,
                    document.body,
                  )}
              </div>
            )}
          </form.Subscribe>
        </CardFooter>
      </form>
    </Card>
  )
}
