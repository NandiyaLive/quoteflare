import { Link } from '@tanstack/react-router'
import Container from '@/components/common/container'
import { STEPS } from './steps'

export function StepNav() {
  return (
    <div className="sticky top-14 z-40 border-b bg-background/80 backdrop-blur">
      <Container>
        <nav
          aria-label="Calculator steps"
          className="flex gap-6 overflow-x-auto sm:gap-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {STEPS.map((step) => (
            <Link
              key={step.to}
              to={step.to}
              activeOptions={{ exact: true }}
              className="relative shrink-0 py-3 text-base font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-t-full hover:text-foreground focus-visible:text-foreground focus-visible:after:bg-ring"
              activeProps={{
                className: 'text-primary after:bg-primary',
                'aria-current': 'page',
              }}
            >
              {step.label}
            </Link>
          ))}
        </nav>
      </Container>
    </div>
  )
}
