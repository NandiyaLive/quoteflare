import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useRouter } from '@tanstack/react-router'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  MAX_CATEGORIES,
  categoriesSchema,
  type CategoriesFormValues,
} from '#/lib/services'
import { toast } from 'sonner'
import { callAction, toastFormErrors } from '#/lib/action-errors'

type CategoryResult =
  { ok: true } | { ok: false; errors: Record<string, string> }

export function CategoriesDialog({
  open,
  categories,
  noun,
  save,
  onClose,
}: {
  open: boolean
  categories: { id: string; name: string }[]
  /** Plural name of what the categories group, such as "services". */
  noun: string
  save: (values: CategoriesFormValues) => Promise<CategoryResult>
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {open && (
          <CategoriesForm
            initial={{
              categories: categories.map((c) => ({ id: c.id, name: c.name })),
            }}
            noun={noun}
            save={save}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CategoriesForm({
  initial,
  noun,
  save,
  onDone,
}: {
  initial: CategoriesFormValues
  noun: string
  save: (values: CategoriesFormValues) => Promise<CategoryResult>
  onDone: () => void
}) {
  const router = useRouter()
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})

  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: categoriesSchema },
    onSubmit: async ({ value }) => {
      setServerErrors({})
      const result = await callAction(
        () => save(value),
        'Could not save the categories. Try again.',
      )
      if (!result) return
      if (result.ok) {
        toast.success('Categories saved.')
        await router.invalidate()
        onDone()
        return
      }
      setServerErrors(result.errors)
      toastFormErrors(result.errors)
    },
  })

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <DialogHeader>
        <DialogTitle>Categories</DialogTitle>
        <DialogDescription>
          Categories group {noun} in the calculator. A category can be removed
          once it has no {noun}.
        </DialogDescription>
      </DialogHeader>

      <form.Field name="categories" mode="array">
        {(listField) => (
          <FieldGroup>
            {listField.state.value.map((category, index) => (
              <div
                key={category.id ?? `new-${index}`}
                className="grid grid-cols-[1fr_auto_auto_auto] items-start gap-1"
              >
                <form.Field name={`categories[${index}].name`}>
                  {(field) => {
                    const errors = serverErrors[field.name]
                      ? [
                          ...field.state.meta.errors,
                          { message: serverErrors[field.name] },
                        ]
                      : field.state.meta.errors
                    const invalid = errors.length > 0
                    return (
                      <Field data-invalid={invalid}>
                        <Input
                          aria-label={`Category ${index + 1} name`}
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
                <ButtonGroup>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Move category ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => listField.moveValue(index, index - 1)}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Move category ${index + 1} down`}
                    disabled={index === listField.state.value.length - 1}
                    onClick={() => listField.moveValue(index, index + 1)}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Remove category ${index + 1}`}
                    onClick={() => listField.removeValue(index)}
                  >
                    <Trash2Icon />
                  </Button>
                </ButtonGroup>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={listField.state.value.length >= MAX_CATEGORIES}
              onClick={() => listField.pushValue({ name: '' })}
            >
              <PlusIcon data-icon="inline-start" />
              Add category
            </Button>
          </FieldGroup>
        )}
      </form.Field>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(submitting) => (
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save categories'}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}
