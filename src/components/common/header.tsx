import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import Container from '@/components/common/container'
import ThemeToggle from '@/components/common/theme-toggle'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
      <Container className="flex h-14 items-center gap-1">
        <Button
          variant="ghost"
          nativeButton={false}
          render={<Link to="/" />}
          className="-ml-2.5 font-semibold"
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
      </Container>
    </header>
  )
}
