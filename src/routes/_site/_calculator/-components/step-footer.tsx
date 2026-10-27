import { Link, useLocation } from '@tanstack/react-router'
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { STEPS } from './steps'

export function StepFooter() {
  const { pathname } = useLocation()
  const index = Math.max(
    0,
    STEPS.findIndex((s) => s.to === pathname.replace(/(.)\/$/, '$1')),
  )
  const previous = STEPS[index - 1]
  const next = STEPS[index + 1]
  if (!next) return null

  return (
    <div className="flex justify-between gap-3 border-t pt-5">
      {previous ? (
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to={previous.to} />}
        >
          <ArrowLeftIcon />
          Back
        </Button>
      ) : (
        <span />
      )}
      <Button nativeButton={false} render={<Link to={next.to} />}>
        {next.to === '/review' ? 'Review quote' : 'Continue'}
        <ArrowRightIcon />
      </Button>
    </div>
  )
}
