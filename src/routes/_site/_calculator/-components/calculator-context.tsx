import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  baseState,
  deselectService,
  evaluate,
  restoreSaved,
  selectService,
  stateForPackage,
  type CalculatorCatalog,
  type CalculatorState,
  type ChosenService,
  type Evaluation,
} from '#/lib/calculator'
import { createId } from '@paralleldrive/cuid2'
import { convertMinor, formatConverted } from '#/lib/currencies'
import { formatMinor } from '#/lib/decimal'

export const SCRATCH = 'scratch'

const STORAGE_KEY = 'quoteflare:calculator:v1'
const QUOTES_KEY = 'quoteflare:local-quotes:v1'

type StoredQuote = {
  id: string
  name: string
  savedAt: number
  state: CalculatorState
  chosen: string | null
}

/** A quote saved in this browser, priced against the current catalog. */
export type LocalQuote = {
  id: string
  name: string
  savedAt: number
  /** Total in the catalog currency, in minor units. */
  total: number
  serviceCount: number
}

function readStoredQuotes(catalog: CalculatorCatalog): StoredQuote[] {
  try {
    const raw = window.localStorage.getItem(QUOTES_KEY)
    const list: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) return []
    return list.flatMap((item) => {
      const { id, name, savedAt } = (item ?? {}) as Record<string, unknown>
      const saved = restoreSaved(catalog, item)
      if (!saved || typeof id !== 'string' || typeof savedAt !== 'number')
        return []
      return [
        { id, name: typeof name === 'string' ? name : '', savedAt, ...saved },
      ]
    })
  } catch {
    return []
  }
}

// Storage can throw or be empty in private windows, so every access is guarded.
export function clearSavedCalculator() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear.
  }
}

type CalculatorValue = {
  catalog: CalculatorCatalog
  state: CalculatorState
  evaluation: Evaluation
  /** A package id, `SCRATCH`, or null before the customer has chosen. */
  chosen: string | null
  /** The currency prices are shown in. Quotes are always issued in `catalog.currency`. */
  displayCurrency: string
  setDisplayCurrency: (currency: string) => void
  /** Formats base-currency cents in the display currency. */
  money: (minor: number) => string
  choose: (target: string) => void
  toggle: (id: string, checked: boolean) => void
  change: (id: string, patch: Partial<ChosenService>) => void
  /** Empties the selection and forgets the chosen package. */
  reset: () => void
  /** Quotes saved in this browser, newest first. */
  localQuotes: LocalQuote[]
  saveLocalQuote: (name: string) => void
  loadLocalQuote: (id: string) => void
  removeLocalQuote: (id: string) => void
}

const CalculatorContext = createContext<CalculatorValue | null>(null)

export function CalculatorProvider({
  catalog,
  children,
}: {
  catalog: CalculatorCatalog
  children: ReactNode
}) {
  const [state, setState] = useState<CalculatorState>(() => baseState(catalog))
  const [chosen, setChosen] = useState<string | null>(null)
  const [picked, setPicked] = useState(catalog.currency)
  const displayCurrency =
    picked !== catalog.currency && catalog.rates[picked]
      ? picked
      : catalog.currency
  const evaluation = useMemo(() => evaluate(catalog, state), [catalog, state])
  const [restored, setRestored] = useState(false)
  const [stored, setStored] = useState<StoredQuote[]>([])

  // Storage is only readable after hydration, so restore in an effect.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      const saved = raw ? restoreSaved(catalog, JSON.parse(raw)) : null
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState(saved.state)
        setChosen(saved.chosen)
      }
    } catch {
      // A corrupt or blocked store leaves the default selection.
    }
    setStored(readStoredQuotes(catalog))
    setRestored(true)
  }, [catalog])

  const localQuotes = useMemo<LocalQuote[]>(
    () =>
      stored.map((quote) => {
        const { breakdown } = evaluate(catalog, quote.state)
        return {
          id: quote.id,
          name: quote.name,
          savedAt: quote.savedAt,
          total: breakdown.total,
          serviceCount: breakdown.lines.length,
        }
      }),
    [catalog, stored],
  )

  const updateStored = (next: StoredQuote[]) => {
    setStored(next)
    try {
      window.localStorage.setItem(QUOTES_KEY, JSON.stringify(next))
    } catch {
      // The list still works until the page closes.
    }
  }

  useEffect(() => {
    if (!restored || chosen === null) return
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ state, chosen }),
      )
    } catch {
      // The selection just is not saved.
    }
  }, [restored, state, chosen])

  const value = useMemo<CalculatorValue>(
    () => ({
      catalog,
      state,
      evaluation,
      chosen,
      displayCurrency,
      setDisplayCurrency: setPicked,
      money: (minor) =>
        displayCurrency === catalog.currency
          ? formatMinor(minor, catalog.currency)
          : formatConverted(
              convertMinor(
                minor,
                catalog.rates[displayCurrency],
                displayCurrency,
              ),
              displayCurrency,
            ),
      choose: (target) => {
        const pkg = catalog.packages.find((p) => p.id === target)
        setState(pkg ? stateForPackage(catalog, pkg) : baseState(catalog))
        setChosen(pkg ? pkg.id : SCRATCH)
      },
      toggle: (id, checked) =>
        setState((current) =>
          checked
            ? selectService(catalog, current, id)
            : deselectService(catalog, current, id),
        ),
      change: (id, patch) =>
        setState((current) => ({
          ...current,
          [id]: { ...current[id], ...patch },
        })),
      reset: () => {
        setState(baseState(catalog))
        setChosen(null)
        clearSavedCalculator()
      },
      localQuotes,
      saveLocalQuote: (name) =>
        updateStored([
          { id: createId(), name, savedAt: Date.now(), state, chosen },
          ...stored,
        ]),
      loadLocalQuote: (id) => {
        const quote = stored.find((q) => q.id === id)
        if (!quote) return
        setState(quote.state)
        setChosen(quote.chosen ?? SCRATCH)
      },
      removeLocalQuote: (id) => updateStored(stored.filter((q) => q.id !== id)),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, state, evaluation, chosen, displayCurrency, localQuotes],
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
