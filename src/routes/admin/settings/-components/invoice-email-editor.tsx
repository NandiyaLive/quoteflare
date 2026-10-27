import { useEffect, useState } from 'react'
import { useForm, useStore } from '@tanstack/react-form'
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
import { Textarea } from '@/components/ui/textarea'
import {
  DEFAULT_INVOICE_EMAIL,
  invoiceEmailTemplateSchema,
  TEMPLATE_VARIABLES,
  type InvoiceEmailTemplate,
} from '#/lib/email-template'
import {
  previewInvoiceEmail,
  updateInvoiceEmailTemplate,
} from '#/server/settings-actions'

export function InvoiceEmailEditor({
  initial,
}: {
  initial: InvoiceEmailTemplate
}) {
  const router = useRouter()
  const [saved, setSaved] = useState(false)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<{
    subject: string
    html: string
  } | null>(null)

  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: invoiceEmailTemplateSchema },
    onSubmit: async ({ value }) => {
      setSaved(false)
      setServerErrors({})
      const result = await updateInvoiceEmailTemplate({ data: value })
      if (result.ok) {
        setSaved(true)
        await router.invalidate()
        return
      }
      setServerErrors(result.errors)
    },
  })

  const values = useStore(form.store, (s) => s.values)
  useEffect(() => {
    const parsed = invoiceEmailTemplateSchema.safeParse(values)
    if (!parsed.success) return
    let stale = false
    const timer = setTimeout(() => {
      previewInvoiceEmail({ data: parsed.data })
        .then((result) => {
          if (!stale) setPreview(result)
        })
        .catch(() => {})
    }, 400)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [values])

  const field = (
    name: keyof InvoiceEmailTemplate,
    label: string,
    placeholder: string,
    multiline = false,
  ) => (
    <form.Field name={name}>
      {(f) => {
        const errors = serverErrors[name]
          ? [...f.state.meta.errors, { message: serverErrors[name] }]
          : f.state.meta.errors
        const invalid = errors.length > 0
        const shared = {
          id: name,
          name,
          value: f.state.value,
          placeholder,
          'aria-invalid': invalid,
          onBlur: f.handleBlur,
        }
        return (
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            {multiline ? (
              <Textarea
                rows={6}
                {...shared}
                onChange={(e) => f.handleChange(e.target.value)}
              />
            ) : (
              <Input
                {...shared}
                onChange={(e) => f.handleChange(e.target.value)}
              />
            )}
            {invalid && <FieldError errors={errors} />}
          </Field>
        )
      }}
    </form.Field>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice email</CardTitle>
        <CardDescription>
          The email clients get with their invoice link. Clear a field to fall
          back to the default. Available placeholders:{' '}
          {TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(', ')}.
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
            {field('subject', 'Subject', DEFAULT_INVOICE_EMAIL.subject)}
            {field('body', 'Message', DEFAULT_INVOICE_EMAIL.body, true)}
            <FieldDescription>
              A blank line starts a new paragraph.
            </FieldDescription>
            {field('button', 'Button label', DEFAULT_INVOICE_EMAIL.button)}
            {preview && (
              <Field>
                <FieldLabel>Preview</FieldLabel>
                <p className="text-sm text-muted-foreground">
                  Subject: {preview.subject}
                </p>
                <iframe
                  title="Invoice email preview"
                  sandbox=""
                  srcDoc={preview.html}
                  className="h-80 w-full rounded-md border bg-white"
                />
              </Field>
            )}
            {serverErrors.form && (
              <p role="alert" className="text-sm text-destructive">
                {serverErrors.form}
              </p>
            )}
          </FieldGroup>
        </CardContent>
        <CardFooter className="gap-3">
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(submitting) => (
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : 'Save template'}
              </Button>
            )}
          </form.Subscribe>
          <Button
            type="button"
            variant="outline"
            onClick={() => form.reset({ ...DEFAULT_INVOICE_EMAIL })}
          >
            Reset to default
          </Button>
          {saved && (
            <p role="status" className="text-sm text-muted-foreground">
              Template saved.
            </p>
          )}
        </CardFooter>
      </form>
    </Card>
  )
}
