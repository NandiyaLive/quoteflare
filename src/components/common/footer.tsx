export default function Footer() {
  return (
    <footer className="border-t px-4 py-6 text-sm text-muted-foreground">
      <div className="mx-auto max-w-5xl">
        &copy; {new Date().getFullYear()} QuoteKit
      </div>
    </footer>
  )
}
