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
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { LOGO_ACCEPT } from '#/lib/settings'
import { uploadLogo } from '#/server/settings-actions'
import { toast } from 'sonner'
import { describeFailure } from '#/lib/action-errors'

export function LogoUpload({ logoKey }: { logoKey: string | null }) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const body = new FormData(form)
    const file = body.get('logo')
    if (!(file instanceof File) || file.size === 0) {
      toast.error('Choose a logo file to upload.')
      return
    }
    setUploading(true)
    try {
      const result = await uploadLogo({ data: body })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Logo uploaded.')
      form.reset()
      await router.invalidate()
    } catch (error) {
      console.error(error)
      toast.error(describeFailure(error, 'The upload failed. Try again.'))
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
          <Field>
            <FieldLabel htmlFor="logo">Upload a new logo</FieldLabel>
            <Input id="logo" name="logo" type="file" accept={LOGO_ACCEPT} />
            <FieldDescription>PNG, JPG or SVG, 1 MB maximum.</FieldDescription>
          </Field>
          <Button type="submit" disabled={uploading} className="w-fit">
            {uploading ? 'Uploading...' : 'Upload logo'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
