import { createFileRoute } from '@tanstack/react-router'
import { ScopeStep } from '../-components/scope-step'

export const Route = createFileRoute('/_site/_calculator/scope/')({
  component: ScopeStep,
})
