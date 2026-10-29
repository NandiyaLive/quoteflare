import type { z } from 'zod'

type Path = PropertyKey[]

export const firstSegment = (path: Path) =>
  path.length > 0 ? String(path[0]) : ''

export const dottedPath = (path: Path) => path.map(String).join('.')

export function fieldErrors(error: z.ZodError, keyOf: (path: Path) => string) {
  const errors: Record<string, string> = {}
  for (const issue of error.issues) {
    errors[keyOf(issue.path) || 'form'] ??= issue.message
  }
  return errors
}
