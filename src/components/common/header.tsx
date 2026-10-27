import Container from '@/components/common/container'
import Logo from '@/components/common/logo'
import ThemeToggle from '@/components/common/theme-toggle'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
      <Container className="flex h-14 items-center gap-1">
        <Logo
          variant="text"
          aria-label="Quoteflare"
          role="img"
          className="h-5 w-auto"
        />
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </Container>
    </header>
  )
}
