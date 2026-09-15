import { useEffect, useState } from "react"

/**
 * Brief branded overlay shown on top of the app while the native Android
 * splash hands off to the WebView. Home renders normally underneath the
 * whole time — this only fades itself out, it never delays anything.
 */
export function StartupSplash() {
  const [mounted, setMounted] = useState(true)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    // One frame to let the initial (opaque) paint commit, then start the
    // CSS opacity transition. Not a hold/delay — just what's needed for
    // the fade to actually animate instead of jumping straight to 0.
    const raf = requestAnimationFrame(() => setFading(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!mounted) return null

  return (
    <div
      aria-hidden="true"
      className="startup-splash"
      style={{ opacity: fading ? 0 : 1 }}
      onTransitionEnd={() => setMounted(false)}
    >
      <img src="/icons/splash-logo.png" alt="" className="startup-splash-logo" />
    </div>
  )
}
