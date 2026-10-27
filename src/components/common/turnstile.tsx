import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    },
  ) => string
  remove: (widgetId: string) => void
  reset: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let scriptPromise: Promise<TurnstileApi> | null = null

function loadTurnstile() {
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error('Turnstile did not load'))
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Turnstile did not load'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

export function Turnstile({
  siteKey,
  resetKey,
  onToken,
}: {
  siteKey: string
  resetKey: number
  onToken: (token: string) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const onTokenRef = useRef(onToken)

  useEffect(() => {
    onTokenRef.current = onToken
  })

  useEffect(() => {
    let widgetId: string | undefined
    let cancelled = false
    void loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return
        widgetId = api.render(container.current, {
          sitekey: siteKey,
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(''),
          'error-callback': () => onTokenRef.current(''),
        })
      })
      .catch(() => {
        if (cancelled) return
        toast.error(
          'The spam check could not load. Reload the page and try again.',
        )
        onTokenRef.current('')
      })
    return () => {
      cancelled = true
      if (widgetId) window.turnstile?.remove(widgetId)
    }
  }, [siteKey, resetKey])

  return <div ref={container} data-testid="turnstile" />
}
