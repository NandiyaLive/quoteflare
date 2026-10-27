import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  deselectService,
  evaluate,
  selectService,
  type CalculatorCatalog,
  type CalculatorState,
  type ChosenService,
  type Evaluation,
} from '#/lib/calculator'

type CalculatorValue = {
  catalog: CalculatorCatalog
  state: CalculatorState
  evaluation: Evaluation
  toggle: (id: string, checked: boolean) => void
  change: (id: string, patch: Partial<ChosenService>) => void
}

const CalculatorContext = createContext<CalculatorValue | null>(null)

export function CalculatorProvider({
  catalog,
  children,
}: {
  catalog: CalculatorCatalog
  children: ReactNode
}) {
  const [state, setState] = useState<CalculatorState>({})
  const evaluation = useMemo(() => evaluate(catalog, state), [catalog, state])

  const value = useMemo<CalculatorValue>(
    () => ({
      catalog,
      state,
      evaluation,
      toggle: (id, checked) =>
        setState((current) =>
          checked
            ? selectService(catalog, current, id)
            : deselectService(current, id),
        ),
      change: (id, patch) =>
        setState((current) => ({
          ...current,
          [id]: { ...current[id], ...patch },
        })),
    }),
    [catalog, state, evaluation],
  )

  return (
    <CalculatorContext.Provider value={value}>
      {children}
    </CalculatorContext.Provider>
  )
}

export function useCalculator() {
  const value = useContext(CalculatorContext)
  if (!value) throw new Error('useCalculator needs a CalculatorProvider')
  return value
}
