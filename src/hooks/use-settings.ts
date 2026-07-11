import { useState, useEffect, useCallback } from "react"
import type { AppSettings } from "@/types"
import { DEFAULT_SETTINGS } from "@/types"

const STORAGE_KEY = "ukepocket_settings"

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(loadSettings)

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  // Wake Lock
  useEffect(() => {
    if (!settings.keepScreenAwake) return
    if (!("wakeLock" in navigator)) return

    let lock: WakeLockSentinel | null = null

    async function acquire() {
      try {
        lock = await (navigator as Navigator & { wakeLock: { request: (t: string) => Promise<WakeLockSentinel> } }).wakeLock.request("screen")
      } catch {}
    }

    acquire()
    const reacquire = () => { if (document.visibilityState === "visible") acquire() }
    document.addEventListener("visibilitychange", reacquire)

    return () => {
      document.removeEventListener("visibilitychange", reacquire)
      lock?.release().catch(() => {})
    }
  }, [settings.keepScreenAwake])

  return { settings, updateSettings }
}
