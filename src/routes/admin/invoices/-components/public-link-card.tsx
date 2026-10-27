import { ExternalLinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function PublicLinkCard({ token }: { token: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Public link</CardTitle>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          nativeButton={false}
          render={<a href={`/i/${token}`} target="_blank" rel="noreferrer" />}
        >
          <ExternalLinkIcon />
          Open public invoice
        </Button>
      </CardContent>
    </Card>
  )
}
