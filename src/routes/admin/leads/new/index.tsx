import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import PageHeader from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { callAction } from '#/lib/action-errors'
import { pickSharedInput } from '#/lib/lead-share'
import { LEAD_PLATFORM_LABELS, parseProfileUrl } from '#/lib/leads'
import { findLeadAction, saveLeadAction } from '#/server/leads-actions'

const searchSchema = z.object({
  url: z.string().max(2000).optional().catch(undefined),
  text: z.string().max(2000).optional().catch(undefined),
})

export const Route = createFileRoute('/admin/leads/new/')({
  staticData: { breadcrumb: 'Save lead' },
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ url: search.url, text: search.text }),
  loader: async ({ deps }) => {
    const input = pickSharedInput(deps)
    const existingId = input ? await findLeadAction({ data: input }) : null
    return { input, existingId }
  },
  component: NewLeadPage,
})

function NewLeadPage() {
  const { input: sharedInput, existingId } = Route.useLoaderData()
  const navigate = useNavigate()
  const [input, setInput] = useState(sharedInput)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  const parsed = useMemo(() => parseProfileUrl(input), [input])

  useEffect(() => {
    if (!existingId) return
    toast.info('Already saved.')
    void navigate({
      to: '/admin/leads/$leadId',
      params: { leadId: existingId },
      replace: true,
    })
  }, [existingId, navigate])

  const submit = async () => {
    setError(null)
    setBusy(true)
    const result = await callAction(
      () => saveLeadAction({ data: { input, name, note } }),
      'Could not save the lead. Try again.',
    )
    setBusy(false)
    if (!result) return
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (result.existing) {
      toast.info('Already saved.')
      await navigate({
        to: '/admin/leads/$leadId',
        params: { leadId: result.id },
      })
      return
    }
    setSavedId(result.id)
  }

  if (existingId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Save lead" />
        <p className="text-muted-foreground">Opening the saved lead...</p>
      </div>
    )
  }

  if (savedId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Saved" />
        <Card>
          <CardContent className="flex flex-col items-start gap-4">
            <p className="flex items-center gap-2">
              <CheckCircle2Icon className="size-5 text-primary" />
              {parsed.ok ? parsed.handle : 'Lead'} is saved.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button nativeButton={false} render={<Link to="/admin" />}>
                Done
              </Button>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link to="/admin/leads" />}
              >
                Open leads
              </Button>
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <Link
                    to="/admin/leads/$leadId"
                    params={{ leadId: savedId }}
                  />
                }
              >
                View lead
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const shownError = error ?? (input.trim() && !parsed.ok ? parsed.error : null)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Save lead" />
      <Card>
        <CardHeader>
          <CardTitle>
            {parsed.ok
              ? `${LEAD_PLATFORM_LABELS[parsed.platform]}: ${parsed.handle}`
              : 'Profile link'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <Field data-invalid={shownError !== null}>
              <FieldLabel htmlFor="lead-input">
                Profile link or @handle
              </FieldLabel>
              <Input
                id="lead-input"
                autoComplete="off"
                value={input}
                aria-invalid={shownError !== null}
                onChange={(e) => {
                  setInput(e.target.value)
                  setError(null)
                }}
              />
              {shownError && <FieldError errors={[{ message: shownError }]} />}
            </Field>
            <Field>
              <FieldLabel htmlFor="lead-name">Name (optional)</FieldLabel>
              <Input
                id="lead-name"
                autoComplete="off"
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="lead-note">Note (optional)</FieldLabel>
              <Textarea
                id="lead-note"
                maxLength={5000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <div>
              <Button type="submit" disabled={busy || !parsed.ok}>
                {busy ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
