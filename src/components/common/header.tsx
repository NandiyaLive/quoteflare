import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import ThemeToggle from '@/components/common/theme-toggle'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
        <Button
          variant="ghost"
          nativeButton={false}
          render={<Link to="/" />}
          className="font-semibold"
        >
          QuoteKit
        </Button>
        <Button
          variant="ghost"
          nativeButton={false}
          render={<Link to="/about" />}
        >
          About
        </Button>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
