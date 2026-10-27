import { Outlet } from '@tanstack/react-router'
import Container from '@/components/common/container'
import PageHeader from '@/components/common/page-header'
import type { CalculatorCatalog } from '#/lib/calculator'
import { CalculatorProvider, useCalculator } from './calculator-context'
import { StepFooter } from './step-footer'
import { StepNav } from './step-nav'
import { Summary } from './summary'

function Shell() {
  const { catalog, evaluation } = useCalculator()
  return (
    <Container className="flex flex-col gap-8 pb-20 lg:pb-0">
      <PageHeader
        title="Price calculator"
        description="Work through the steps. The estimate updates as you choose."
      />
      <StepNav />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-8 empty:hidden">
          <Outlet />
          <StepFooter />
        </div>
        <Summary
          breakdown={evaluation.breakdown}
          currency={catalog.currency}
          taxRateBps={catalog.taxRateBps}
        />
      </div>
    </Container>
  )
}

export function CalculatorLayout({ catalog }: { catalog: CalculatorCatalog }) {
  return (
    <CalculatorProvider catalog={catalog}>
      <Shell />
    </CalculatorProvider>
  )
}
