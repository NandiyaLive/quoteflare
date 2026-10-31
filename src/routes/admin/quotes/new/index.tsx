import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import BackButton from '@/components/common/back-button'
import PageHeader from '@/components/common/page-header'
import { SearchSelect } from '@/components/common/search-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { callAction } from '#/lib/action-errors'
import { formatMinor, minorToDecimal } from '#/lib/decimal'
import { MAX_QUOTE_ITEMS, quoteCreateSchema, repriceQuote } from '#/lib/quotes'
import { getInvoiceFormContext } from '#/server/invoices-actions'
import { createQuoteAction } from '#/server/quote-actions'

type DraftItem = {
  description: string
  quantity: string
  unitPrice: string
  taxable: boolean
}

const emptyItem = (): DraftItem => ({
  description: '',
  quantity: '1',
  unitPrice: '0',
  taxable: true,
})

export const Route = createFileRoute('/admin/quotes/new/')({
  staticData: { breadcrumb: 'New quote' },
  loader: () => getInvoiceFormContext(),
  component: NewQuotePage,
})

function NewQuotePage() {
  const context = Route.useLoaderData()
  const { clients, services, currency, taxRateBps } = context
  const navigate = useNavigate()

  const [clientId, setClientId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [items, setItems] = useState<DraftItem[]>([emptyItem()])
  const [discount, setDiscount] = useState('0')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const parsed = quoteCreateSchema.safeParse({
    name,
    email,
    items,
    discount,
    adminNote: note,
  })
  const preview = parsed.success
    ? repriceQuote(parsed.data, [], taxRateBps, () => 'preview')
    : null

  const update = (index: number, patch: Partial<DraftItem>) =>
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    )

  const pickClient = (id: string) => {
    const client = clients.find((c) => c.id === id)
    if (!client) return
    setClientId(id)
    setName(client.name)
    setEmail(client.email)
  }

  const save = async () => {
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        next[issue.path.join('.')] ??= issue.message
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
          createQuoteAction({
            data: { name, email, items, discount, adminNote: note },
          }),
        'Could not create the quote. Try again.',
      )
      if (!result) return
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Quote created.')
      await navigate({
        to: '/admin/quotes/$quoteId',
        params: { quoteId: result.id },
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
          <BackButton link={<Link to="/admin/quotes" />}>
            Back to quotes
          </BackButton>
        }
        title="New quote"
        description="Write a quote for a client who did not use the calculator. You send it from the next page."
      >
        <Button disabled={busy} onClick={() => void save()}>
          Create quote
        </Button>
      </PageHeader>
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Client</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="quote-client">
                  Existing client, optional
                </FieldLabel>
                <SearchSelect
                  id="quote-client"
                  value={clientId}
                  placeholder="Choose a client to fill in the details"
                  emptyText="No clients found."
                  options={clients.map((c) => ({
                    value: c.id,
                    label: c.company ? `${c.name} (${c.company})` : c.name,
                  }))}
                  onValueChange={pickClient}
                />
              </Field>
              <Field data-invalid={Boolean(errors.name)}>
                <FieldLabel htmlFor="quote-name">Name</FieldLabel>
                <Input
                  id="quote-name"
                  value={name}
                  aria-invalid={Boolean(errors.name)}
                  onChange={(e) => setName(e.target.value)}
                />
                {errors.name && (
                  <FieldError errors={[{ message: errors.name }]} />
                )}
              </Field>
              <Field data-invalid={Boolean(errors.email)}>
                <FieldLabel htmlFor="quote-email">Email</FieldLabel>
                <Input
                  id="quote-email"
                  type="email"
                  value={email}
                  aria-invalid={Boolean(errors.email)}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {errors.email && (
                  <FieldError errors={[{ message: errors.email }]} />
                )}
              </Field>
            </CardContent>
          </Card>

          <Card>
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
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={items.length >= MAX_QUOTE_ITEMS}
                  onClick={() =>
                    setItems((current) => [...current, emptyItem()])
                  }
                >
                  <PlusIcon data-icon="inline-start" />
                  Add item
                </Button>
                <SearchSelect
                  aria-label="Add from a service"
                  value={null}
                  disabled={
                    items.length >= MAX_QUOTE_ITEMS || services.length === 0
                  }
                  placeholder="Add from a service"
                  emptyText="No services found."
                  contentClassName="min-w-72"
                  options={services.map((s) => ({
                    value: s.id,
                    label: `${s.name} (${money(s.unitPrice)})`,
                  }))}
                  onValueChange={(serviceId) => {
                    const service = services.find((s) => s.id === serviceId)
                    if (!service) return
                    const added: DraftItem = {
                      description: service.name,
                      quantity: String(service.minQuantity),
                      unitPrice: minorToDecimal(service.unitPrice),
                      taxable: service.taxable,
                    }
                    // Replace the untouched starter row instead of leaving it blank.
                    setItems((current) =>
                      current.length === 1 &&
                      current[0].description === '' &&
                      current[0].unitPrice === '0'
                        ? [added]
                        : [...current, added],
                    )
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

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
                    <dd data-testid="quote-new-total">
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
