import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_site/')({ component: Home })

function Home() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col items-start gap-4 px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">QuoteKit</h1>
      <p className="max-w-xl text-muted-foreground">
        Pricing calculator and invoicing for a single business.
      </p>
      <Button>Get started</Button>
    </main>
  )
}
