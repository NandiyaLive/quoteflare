import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { CheckCircle2Icon } from 'lucide-react'
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
import { quoteDetailsSchema } from '#/lib/quotes'
import { submitQuoteAction } from '#/server/quote-actions'
import { useCalculator } from '../../-components/calculator-context'
import { callAction } from '#/lib/action-errors'

export function QuoteForm({ turnstileSiteKey }: { turnstileSiteKey: string }) {
  const { catalog, state, evaluation } = useCalculator()
  const [token, setToken] = useState('')
  const [widgetKey, setWidgetKey] = useState(0)
  const [sent, setSent] = useState(false)

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
    defaultValues: { name: '', email: '', message: '' },
    validators: { onSubmit: quoteDetailsSchema },
    onSubmit: async ({ value }) => {
      if (!token) {
        toast.error('Complete the spam check.')
        return
      }
      const result = await callAction(
        () =>
          submitQuoteAction({
            data: { ...value, turnstileToken: token, selections },
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
          Thank you. We will reply to the email address you gave.
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
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(submitting) => (
              <Button type="submit" disabled={blocked || submitting}>
                {submitting ? 'Sending...' : 'Send quote request'}
              </Button>
            )}
          </form.Subscribe>
        </CardFooter>
      </form>
    </Card>
  )
}
