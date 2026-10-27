import Logo from '@/components/common/logo'
import ThemeToggle from '@/components/common/theme-toggle'

type Branding = { name: string; hasLogo: boolean }

/** Business logo first, then the business name, then the app logo. */
function Brand({ name, hasLogo }: Branding) {
  if (hasLogo) {
    return <img src="/files/logo" alt={name} className="max-h-8 w-auto" />
  }
  if (name) return <span className="text-lg font-semibold">{name}</span>
  return (
    <Logo
      variant="text"
      aria-label="Quoteflare"
      role="img"
      className="h-5 w-auto"
    />
  )
}

export default function Header({ branding }: { branding: Branding }) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
      <div className="container flex h-14 items-center gap-1">
        <Brand {...branding} />
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
