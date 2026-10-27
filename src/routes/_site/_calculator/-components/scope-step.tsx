import { useMemo } from 'react'
import type { CalculatorCatalog, CalculatorService } from '#/lib/calculator'
import { useCalculator } from './calculator-context'
import { ServiceCard } from './service-card'

type Section = { id: string; name: string; services: CalculatorService[] }

function groupByCategory(catalog: CalculatorCatalog): Section[] {
  const sections = catalog.categories.map((c) => ({
    ...c,
    services: catalog.services.filter((s) => s.categoryId === c.id),
  }))
  const loose = catalog.services.filter(
    (s) => !catalog.categories.some((c) => c.id === s.categoryId),
  )
  if (loose.length > 0) {
    sections.push({
      id: 'other',
      name: sections.length > 0 ? 'Other' : 'Services',
      services: loose,
    })
  }
  return sections.filter((s) => s.services.length > 0)
}

export function ScopeStep() {
  const { catalog, state, evaluation, toggle, change } = useCalculator()
  const sections = useMemo(() => groupByCategory(catalog), [catalog])
  const names = useMemo(
    () => new Map(catalog.services.map((s) => [s.id, s.name])),
    [catalog],
  )

  if (sections.length === 0) {
    return (
      <p className="text-muted-foreground">
        No services are available right now.
      </p>
    )
  }

  return (
    <>
      {sections.map((section) => (
        <section key={section.id} className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{section.name}</h2>
          {section.services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              currency={catalog.currency}
              choice={state[service.id]}
              problems={evaluation.problems[service.id] ?? []}
              requiredBy={catalog.services
                .filter((s) => state[s.id] && s.requires.includes(service.id))
                .map((s) => s.name)}
              requires={service.requires.map((id) => names.get(id) ?? '')}
              onToggle={(checked) => toggle(service.id, checked)}
              onChange={(patch) => change(service.id, patch)}
            />
          ))}
        </section>
      ))}
    </>
  )
}
