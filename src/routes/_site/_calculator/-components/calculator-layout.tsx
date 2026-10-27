import { Outlet } from '@tanstack/react-router'
import type { CalculatorCatalog } from '#/lib/calculator'
import { CalculatorProvider, useCalculator } from './calculator-context'
import { StepFooter } from './step-footer'
import { StepNav } from './step-nav'
import { Summary } from './summary'

function Shell() {
  const { catalog, evaluation } = useCalculator()
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 pb-28 lg:pb-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Price calculator</h1>
        <p className="text-muted-foreground">
          Work through the steps. The estimate updates as you choose.
        </p>
      </div>
      <StepNav />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Outlet />
          <StepFooter />
        </div>
        <Summary
          breakdown={evaluation.breakdown}
          currency={catalog.currency}
          taxRateBps={catalog.taxRateBps}
        />
      </div>
    </main>
  )
}

export function CalculatorLayout({ catalog }: { catalog: CalculatorCatalog }) {
  return (
    <CalculatorProvider catalog={catalog}>
      <Shell />
    </CalculatorProvider>
  )
}
