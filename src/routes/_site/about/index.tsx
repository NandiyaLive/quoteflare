import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_site/about/')({
  component: About,
})

function About() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">About</h1>
      <p className="max-w-xl text-muted-foreground">
        QuoteKit runs on Cloudflare Workers with TanStack Start.
      </p>
    </main>
  )
}
