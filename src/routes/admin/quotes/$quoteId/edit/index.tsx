import {
  createFileRoute,
  Link,
  notFound,
  redirect,
  useNavigate,
} from '@tanstack/react-router'
import { useState } from 'react'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import BackButton from '@/components/common/back-button'
import PageHeader from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { callAction } from '#/lib/action-errors'
import { formatMinor, minorToDecimal } from '#/lib/decimal'
import {
  EDITABLE_QUOTE_STATUSES,
  MAX_QUOTE_ITEMS,
  quoteEditSchema,
  quoteInvoiceItems,
  repriceQuote,
} from '#/lib/quotes'
import { getQuoteDetail, saveQuoteEditAction } from '#/server/quote-actions'

type DraftItem = {
  description: string
  quantity: string
  unitPrice: string
  taxable: boolean
}

export const Route = createFileRoute('/admin/quotes/$quoteId/edit/')({
  staticData: { breadcrumb: 'Edit' },
  loader: async ({ params }) => {
    const detail = await getQuoteDetail({ data: params.quoteId })
    if (!detail) throw notFound()
    const editable =
      !detail.invoice &&
      detail.quote.breakdown !== null &&
      (EDITABLE_QUOTE_STATUSES as readonly string[]).includes(
        detail.quote.status,
      )
    if (!editable) {
      throw redirect({
        to: '/admin/quotes/$quoteId',
        params: { quoteId: params.quoteId },
      })
    }
    return detail
  },
  notFoundComponent: () => (
    <p className="text-muted-foreground">This quote does not exist.</p>
  ),
  component: EditQuotePage,
})

function EditQuotePage() {
  const { quote, fallbackTaxRateBps } = Route.useLoaderData()
  const navigate = useNavigate()
  const breakdown = quote.breakdown!
  const { currency } = quote

  const [items, setItems] = useState<DraftItem[]>(() =>
    quoteInvoiceItems(breakdown).map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: minorToDecimal(item.unitPrice),
      taxable: item.taxable,
    })),
  )
  const [discount, setDiscount] = useState(
    minorToDecimal(breakdown.discountAmount),
  )
  const [note, setNote] = useState(quote.adminNote)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const parsed = quoteEditSchema.safeParse({
    id: quote.id,
    items,
    discount,
    adminNote: note,
  })
  const preview = parsed.success
    ? repriceQuote(
        parsed.data,
        breakdown.recurring.lines,
        quote.taxRateBps ?? fallbackTaxRateBps,
        () => 'preview',
      )
    : null

  const update = (index: number, patch: Partial<DraftItem>) =>
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    )

  const save = async () => {
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.')
        next[key] ??= issue.message
      }
      setErrors(next)
      toast.error(
        parsed.error.issues[0]?.message ?? 'Check the highlighted fields.',
      )
      return
    }
    setErrors({})
    setBusy(true)
    try {
      const result = await callAction(
        () =>
          saveQuoteEditAction({
            data: { id: quote.id, items, discount, adminNote: note },
          }),
        'Could not save the quote. Try again.',
      )
      if (!result) return
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Quote saved.')
      await navigate({
        to: '/admin/quotes/$quoteId',
        params: { quoteId: quote.id },
      })
    } finally {
      setBusy(false)
    }
  }

  const money = (minor: number) => formatMinor(minor, currency)

  return (
    <>
      <PageHeader
        back={
          <BackButton
            link={
              <Link
                to="/admin/quotes/$quoteId"
                params={{ quoteId: quote.id }}
              />
            }
          >
            Back to quote
          </BackButton>
        }
        title={`Edit quote ${quote.number ?? ''}`.trim()}
        description={
          quote.status === 'sent'
            ? 'This quote is already sent. The client sees the new prices on their link, so resend it afterwards.'
            : 'Change items and prices before you send the quote.'
        }
      >
        <Button disabled={busy} onClick={() => void save()}>
          Save quote
        </Button>
      </PageHeader>
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {items.map((item, index) => (
              <div
                key={index}
                data-testid="quote-line"
                className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-start gap-3 rounded-lg border p-3"
              >
                {(
                  [
                    ['description', 'Description', {}],
                    ['quantity', 'Qty', { inputMode: 'numeric' as const }],
                    [
                      'unitPrice',
                      'Unit price',
                      { inputMode: 'decimal' as const },
                    ],
                  ] as const
                ).map(([key, label, props]) => {
                  const error = errors[`items.${index}.${key}`]
                  return (
                    <Field
                      key={key}
                      data-invalid={Boolean(error)}
                      className={key === 'description' ? 'col-span-full' : ''}
                    >
                      <FieldLabel htmlFor={`quote-item-${index}-${key}`}>
                        {label}
                      </FieldLabel>
                      <Input
                        id={`quote-item-${index}-${key}`}
                        value={item[key]}
                        aria-invalid={Boolean(error)}
                        onChange={(e) =>
                          update(index, { [key]: e.target.value })
                        }
                        {...props}
                      />
                      {error && <FieldError errors={[{ message: error }]} />}
                    </Field>
                  )
                })}
                <div className="col-span-full flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={item.taxable}
                      onCheckedChange={(checked) =>
                        update(index, { taxable: checked === true })
                      }
                    />
                    Taxable
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={items.length === 1}
                    onClick={() =>
                      setItems((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2Icon data-icon="inline-start" />
                    Remove
                  </Button>
                </div>
              </div>
            ))}
            {errors.items && (
              <FieldError errors={[{ message: errors.items }]} />
            )}
            <Button
              variant="outline"
              className="self-start"
              disabled={items.length >= MAX_QUOTE_ITEMS}
              onClick={() =>
                setItems((current) => [
                  ...current,
                  {
                    description: '',
                    quantity: '1',
                    unitPrice: '0',
                    taxable: true,
                  },
                ])
              }
            >
              <PlusIcon data-icon="inline-start" />
              Add item
            </Button>
            {breakdown.recurring.lines.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Recurring charges stay as the client requested them.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Discount</CardTitle>
            </CardHeader>
            <CardContent>
              <Field data-invalid={Boolean(errors.discount)}>
                <FieldLabel htmlFor="quote-discount">
                  Amount off the subtotal
                </FieldLabel>
                <Input
                  id="quote-discount"
                  inputMode="decimal"
                  value={discount}
                  aria-invalid={Boolean(errors.discount)}
                  onChange={(e) => setDiscount(e.target.value)}
                />
                {errors.discount && (
                  <FieldError errors={[{ message: errors.discount }]} />
                )}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Totals</CardTitle>
            </CardHeader>
            <CardContent>
              {preview ? (
                <dl className="flex flex-col gap-1 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt>Subtotal</dt>
                    <dd>{money(preview.subtotal)}</dd>
                  </div>
                  {preview.discountAmount > 0 && (
                    <div className="flex justify-between gap-4">
                      <dt>Discount</dt>
                      <dd>-{money(preview.discountAmount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-4">
                    <dt>Tax</dt>
                    <dd>{money(preview.taxAmount)}</dd>
                  </div>
                  <div className="flex justify-between gap-4 text-base font-semibold">
                    <dt>Total</dt>
                    <dd data-testid="quote-edit-total">
                      {money(preview.total)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Fix the highlighted fields to see the total.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Internal note</CardTitle>
            </CardHeader>
            <CardContent>
              <Field data-invalid={Boolean(errors.adminNote)}>
                <FieldLabel htmlFor="quote-note">
                  Only you can see this
                </FieldLabel>
                <Textarea
                  id="quote-note"
                  rows={4}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                {errors.adminNote && (
                  <FieldError errors={[{ message: errors.adminNote }]} />
                )}
              </Field>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
