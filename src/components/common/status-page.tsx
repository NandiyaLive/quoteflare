import { Button } from '@/components/ui/button'

export default function StatusPage({
  title,
  message,
}: {
  title: string
  message: string
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{message}</p>
      </div>
      <Button nativeButton={false} render={<a href="/" />}>
        Go to the home page
      </Button>
    </main>
  )
}
