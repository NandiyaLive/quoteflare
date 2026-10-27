import { createFileRoute } from '@tanstack/react-router'
import { getCalculatorCatalog } from '#/server/calculator-actions'
import { CalculatorLayout } from './-components/calculator-layout'

export const Route = createFileRoute('/_site/_calculator')({
  head: () => ({ meta: [{ title: 'Price calculator' }] }),
  loader: () => getCalculatorCatalog(),
  component: CalculatorRoute,
})

function CalculatorRoute() {
  return <CalculatorLayout catalog={Route.useLoaderData()} />
}
