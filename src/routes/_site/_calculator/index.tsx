import { createFileRoute } from '@tanstack/react-router'
import { PackageStep } from './-components/package-step'

export const Route = createFileRoute('/_site/_calculator/')({
  component: PackageStep,
})
