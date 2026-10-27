import { toast } from 'sonner'

const statusOf = (error: unknown): number | null => {
  if (error instanceof Response) return error.status
  if (typeof error === 'object' && error !== null) {
    const status = (error as { status?: unknown }).status
    if (typeof status === 'number') return status
  }
  return null
}

/** Turns a thrown error from a server call into a message the user can act on. */
export function describeFailure(error: unknown, fallback: string): string {
  const status = statusOf(error)
  // The admin middleware answers 401 with the body "Unauthorized", which the
  // server function client rethrows as a plain Error without a status.
  if (
    status === 401 ||
    status === 403 ||
    (error instanceof Error && error.message === 'Unauthorized')
  ) {
    return 'Your session has expired. Reload the page and sign in again.'
  }
  if (status === 429) return 'Too many requests. Wait a moment and try again.'
  if (
    (typeof navigator !== 'undefined' && !navigator.onLine) ||
    (error instanceof TypeError && /fetch|network/i.test(error.message))
  ) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  return fallback
}

/**
 * Runs a server call. If it throws, shows an error toast and returns null,
 * so callers handle `null` as "the request failed" and skip their success path.
 */
export async function callAction<T>(
  action: () => Promise<T>,
  fallback: string,
): Promise<T | null> {
  try {
    return await action()
  } catch (error) {
    console.error(error)
    toast.error(describeFailure(error, fallback))
    return null
  }
}

/** Toasts a failed save. Field errors may sit on a field the form does not show, so always say something. */
export function toastFormErrors(errors: Record<string, string>) {
  toast.error(errors.form ?? 'Fix the highlighted fields and try again.')
}
