import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { LOGO_ACCEPT } from '#/lib/settings'
import { uploadLogo } from '#/server/settings-actions'

export function LogoUpload({ logoKey }: { logoKey: string | null }) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const body = new FormData(form)
    const file = body.get('logo')
    if (!(file instanceof File) || file.size === 0) {
      setError('Choose a logo file to upload.')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const result = await uploadLogo({ data: body })
      if (!result.ok) {
        setError(result.error)
        return
      }
      form.reset()
      await router.invalidate()
    } catch {
      setError('The upload failed. Try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo</CardTitle>
        <CardDescription>Shown on your invoices.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {logoKey ? (
          <img
            src={`/files/logo?v=${encodeURIComponent(logoKey)}`}
            alt="Current logo"
            className="max-h-24 w-fit rounded-md border bg-muted p-2"
          />
        ) : (
          <p className="text-sm text-muted-foreground">No logo uploaded yet.</p>
        )}
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Field data-invalid={error !== null}>
            <FieldLabel htmlFor="logo">Upload a new logo</FieldLabel>
            <Input
              id="logo"
              name="logo"
              type="file"
              accept={LOGO_ACCEPT}
              aria-invalid={error !== null}
            />
            <FieldDescription>PNG, JPG or SVG, 1 MB maximum.</FieldDescription>
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <Button type="submit" disabled={uploading} className="w-fit">
            {uploading ? 'Uploading...' : 'Upload logo'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
