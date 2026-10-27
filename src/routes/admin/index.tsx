import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/')({
  component: AdminHome,
})

function AdminHome() {
  const { admin } = Route.useRouteContext()
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Admin</h1>
      <p className="text-muted-foreground">
        Signed in as <span data-testid="admin-email">{admin.email}</span>
      </p>
    </main>
  )
}
