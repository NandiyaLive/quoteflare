import { Link } from '@tanstack/react-router'
import { STEPS } from './steps'

export function StepNav() {
  return (
    <div className="sticky top-14 z-40 border-b bg-background/80 backdrop-blur">
      <div className="container">
        <nav
          aria-label="Calculator steps"
          className="flex gap-6 overflow-x-auto sm:gap-8 scrollbar-none [&::-webkit-scrollbar]:hidden"
        >
          {STEPS.map((step) => (
            <Link
              key={step.to}
              to={step.to}
              activeOptions={{ exact: true }}
              className="relative shrink-0 py-3 text-base font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.75 after:rounded-t-full hover:text-foreground focus-visible:text-foreground focus-visible:after:bg-ring"
              activeProps={{
                className: 'text-primary after:bg-primary',
                'aria-current': 'page',
              }}
            >
              {step.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
