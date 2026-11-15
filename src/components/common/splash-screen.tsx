import { useEffect, useState } from 'react'

import Logo from '@/components/common/logo'

const MIN_VISIBLE_MS = 400
const FADE_MS = 300

// Covers the page while the installed app loads. The CSS shows it only in
// standalone mode, so browser tabs never see it. It renders on the server, so
// it paints before any JavaScript runs, then fades out once React hydrates.
export function SplashScreen() {
  const [fading, setFading] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const fade = setTimeout(() => setFading(true), MIN_VISIBLE_MS)
    const remove = setTimeout(() => setGone(true), MIN_VISIBLE_MS + FADE_MS)
    return () => {
      clearTimeout(fade)
      clearTimeout(remove)
    }
  }, [])

  if (gone) return null

  return (
    <div
      aria-hidden="true"
      className={`bg-background fixed inset-0 z-[100] hidden items-center justify-center transition-opacity [@media(display-mode:standalone)]:flex ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <Logo variant="mark" className="w-[28vw] max-w-40 min-w-24" />
    </div>
  )
}
