import { useState } from "react"
import { exportBackup, importBackup } from "@/lib/db"
import { useSettings } from "@/hooks/use-settings"
import { useTheme } from "@/components/theme-provider"
import type { AppSettings } from "@/types"
import { ReleasesView } from "./ReleasesView"
import {
  Sun, Moon, Bell, Smartphone, Type,
  Timer, Download, Upload, Info, ChevronRight,
  Share2, Star, Sparkles, Shield, FileText,
} from "lucide-react"

// ── App store / legal URLs ─────────────────────────────────────────────────────
// Fill these in when the app is live and legal pages are ready.
// All handlers already reference these constants — just drop in the URL.
const PLAY_STORE_URL     = ""  // TODO: https://play.google.com/store/apps/details?id=com.swminz.ukepocket
const APP_STORE_URL      = ""  // TODO: https://apps.apple.com/app/ukepocket/id...
const PRIVACY_POLICY_URL = ""  // TODO: https://ukepocket.app/privacy
const TERMS_URL          = ""  // TODO: https://ukepocket.app/terms

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="ios-toggle"
    />
  )
}

// ── Icon badge — colored square matching Apple Settings icons ─────────────────
function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div style={{
      width:          32,
      height:         32,
      borderRadius:   8,
      background:     color,
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center",
      flexShrink:     0,
    }}>
      {children}
    </div>
  )
}

// ── Settings row ──────────────────────────────────────────────────────────────
function Row({
  badge, label, description, children, onClick,
}: {
  badge?:       React.ReactNode
  label:        string
  description?: string
  children?:    React.ReactNode
  onClick?:     () => void
}) {
  const isButton = Boolean(onClick)
  const Tag      = isButton ? "button" : "div"
  return (
    <Tag
      onClick={onClick}
      className="grouped-row"
      style={{
        gap:       12,
        width:     isButton ? "100%" : undefined,
        border:    "none",
        cursor:    isButton ? "pointer" : undefined,
        textAlign: "left",
        background:"var(--card)",
      }}
    >
      {badge && badge}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 17, color: "var(--foreground)", letterSpacing: "-0.41px" }}>
          {label}
        </p>
        {description && (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 1 }}>
            {description}
          </p>
        )}
      </div>
      {children && <div style={{ flexShrink: 0 }}>{children}</div>}
      {isButton && !children && (
        <ChevronRight size={16} style={{ color: "var(--text-tertiary)", opacity: 0.5, flexShrink: 0 }} />
      )}
    </Tag>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <p className="section-label" style={{ paddingLeft: 16, marginBottom: 8 }}>
        {label}
      </p>
      <div className="grouped-section">{children}</div>
    </div>
  )
}

// ── Icon colors ───────────────────────────────────────────────────────────────
const C = {
  blue:   "#007AFF",
  green:  "#34C759",
  orange: "#FF9F0A",
  purple: "#AF52DE",
  red:    "#FF3B30",
  teal:   "#5AC8FA",
  gray:   "#8E8E93",
  indigo: "#5856D6",
}

const I = { color: "#FFFFFF" }  // icon style

// ── Helpers ───────────────────────────────────────────────────────────────────
function openUrl(url: string) {
  if (url) window.open(url, "_blank")
}

// ── Auto-scroll speed presets ─────────────────────────────────────────────────
// Underlying value (px/sec) is preserved — only the UI label changes.
// Default is Normal (40 px/sec), which matches the existing DEFAULT_SETTINGS.
const SCROLL_PRESETS = [
  { label: "Slow",   value: 20 },
  { label: "Normal", value: 40 },
  { label: "Fast",   value: 70 },
] as const

// ── Main component ────────────────────────────────────────────────────────────
export function Settings() {
  const { settings, updateSettings } = useSettings()
  const { theme, setTheme }          = useTheme()

  const [exportMsg,    setExportMsg]    = useState("")
  const [importMsg,    setImportMsg]    = useState("")
  const [shareMsg,     setShareMsg]     = useState("")
  const [rateMsg,      setRateMsg]      = useState("")
  const [showReleases, setShowReleases] = useState(false)

  const set = (patch: Partial<AppSettings>) => updateSettings(patch)

  // ── Backup / Restore ───────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      const json = await exportBackup()
      const blob = new Blob([json], { type: "application/json" })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `ukepocket-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setExportMsg("Backup exported")
      setTimeout(() => setExportMsg(""), 3000)
    } catch { setExportMsg("Export failed") }
  }

  const handleImport = () => {
    const input      = document.createElement("input")
    input.type       = "file"
    input.accept     = ".json,application/json"
    input.onchange   = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const result = await importBackup(await file.text())
        setImportMsg(`Imported ${result.songs} song${result.songs !== 1 ? "s" : ""}`)
        setTimeout(() => setImportMsg(""), 4000)
      } catch {
        setImportMsg("Import failed — invalid backup")
        setTimeout(() => setImportMsg(""), 3000)
      }
    }
    input.click()
  }

  // ── Share ──────────────────────────────────────────────────────────────────
  const handleShare = async () => {
    const shareText = "UkePocket — free ukulele tuner, metronome, chord library and song book."
    const shareUrl  = PLAY_STORE_URL || APP_STORE_URL || "https://ukepocket.app"

    if (navigator.share) {
      try {
        await navigator.share({ title: "UkePocket", text: shareText, url: shareUrl })
      } catch { /* user dismissed share sheet */ }
    } else {
      // Fallback: copy link to clipboard
      try {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`)
        setShareMsg("Link copied!")
        setTimeout(() => setShareMsg(""), 2500)
      } catch { /* clipboard unavailable */ }
    }
  }

  // ── Rate ───────────────────────────────────────────────────────────────────
  const handleRate = () => {
    // Detect Android vs iOS/web and open the appropriate store page.
    const isAndroid =
      typeof window !== "undefined" &&
      (window as unknown as { Capacitor?: { getPlatform?: () => string } })
        .Capacitor?.getPlatform?.() === "android"

    const url = isAndroid ? PLAY_STORE_URL : APP_STORE_URL
    if (url) {
      openUrl(url)
    } else {
      setRateMsg("Coming soon — rating will be available when UkePocket is published.")
      setTimeout(() => setRateMsg(""), 5000)
    }
  }

  // ── Releases sub-screen ────────────────────────────────────────────────────
  if (showReleases) {
    return <ReleasesView onClose={() => setShowReleases(false)} />
  }

  return (
    <div style={{ padding: "8px 16px 56px" }}>

      {/* ══ Practice ══ */}
      <Section label="Practice">
        {/* Appearance */}
        <Row
          badge={
            <Badge color={theme === "dark" ? C.gray : C.blue}>
              {theme === "dark"
                ? <Moon size={16} style={I} />
                : <Sun  size={16} style={I} />}
            </Badge>
          }
          label="Appearance"
        >
          <div className="ios-segmented" style={{ width: "auto" }}>
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`ios-segmented-item ${theme === t ? "active" : ""}`}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", fontSize: 13 }}
              >
                {t === "light"
                  ? <><Sun  size={13} /><span>Light</span></>
                  : <><Moon size={13} /><span>Dark</span></>}
              </button>
            ))}
          </div>
        </Row>

        {/* Large Text */}
        <Row
          badge={<Badge color={C.purple}><Type size={16} style={I} /></Badge>}
          label="Large Text"
          description="Increase UI text size"
        >
          <Toggle value={settings.largeText} onChange={(v) => set({ largeText: v })} />
        </Row>

        {/* Keep Screen Awake */}
        <Row
          badge={<Badge color={C.orange}><Smartphone size={16} style={I} /></Badge>}
          label="Keep Screen Awake"
          description="Prevent auto-lock while practicing"
        >
          <Toggle value={settings.keepScreenAwake} onChange={(v) => set({ keepScreenAwake: v })} />
        </Row>

        {/* Haptic Feedback */}
        <Row
          badge={<Badge color={C.teal}><Bell size={16} style={I} /></Badge>}
          label="Haptic Feedback"
          description="Vibrate on beats and actions"
        >
          <Toggle value={settings.hapticFeedback} onChange={(v) => set({ hapticFeedback: v })} />
        </Row>

        {/* Auto-scroll Speed */}
        <Row
          badge={<Badge color={C.green}><Timer size={16} style={I} /></Badge>}
          label="Auto-scroll Speed"
          description="Speed when auto-scrolling lyrics and chords"
        >
          <div className="ios-segmented" style={{ width: "auto" }}>
            {SCROLL_PRESETS.map(({ label, value }) => (
              <button
                key={label}
                onClick={() => set({ autoScrollSpeed: value })}
                className={`ios-segmented-item ${settings.autoScrollSpeed === value ? "active" : ""}`}
                style={{ padding: "4px 10px", fontSize: 13 }}
              >
                {label}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      {/* ══ Your Music ══ */}
      <Section label="Your Music">
        <Row
          badge={<Badge color={C.blue}><Download size={16} style={I} /></Badge>}
          label="Export Backup"
          description={exportMsg || "Download all songs as a JSON file"}
          onClick={handleExport}
        />
        <Row
          badge={<Badge color={C.blue}><Upload size={16} style={I} /></Badge>}
          label="Import Backup"
          description={importMsg || "Restore songs from a backup file"}
          onClick={handleImport}
        />
      </Section>

      {/* ══ UkePocket ══ */}
      <Section label="UkePocket">
        <Row
          badge={<Badge color={C.blue}><Share2 size={16} style={I} /></Badge>}
          label="Share UkePocket"
          description={shareMsg || "Tell a friend about this app"}
          onClick={handleShare}
        />
        <Row
          badge={<Badge color={C.orange}><Star size={16} style={I} /></Badge>}
          label="Rate UkePocket"
          description={rateMsg || "Leave a rating on the store"}
          onClick={handleRate}
        />
        <Row
          badge={<Badge color={C.purple}><Sparkles size={16} style={I} /></Badge>}
          label="What's New"
          description="Release history and updates"
          onClick={() => setShowReleases(true)}
        />
        <Row
          badge={<Badge color={C.gray}><Shield size={16} style={I} /></Badge>}
          label="Privacy Policy"
          onClick={PRIVACY_POLICY_URL ? () => openUrl(PRIVACY_POLICY_URL) : undefined}
        />
        <Row
          badge={<Badge color={C.gray}><FileText size={16} style={I} /></Badge>}
          label="Terms of Service"
          onClick={TERMS_URL ? () => openUrl(TERMS_URL) : undefined}
        />
      </Section>

      {/* ══ About ══ */}
      <Section label="About">
        <Row
          badge={<Badge color={C.indigo}><Info size={16} style={I} /></Badge>}
          label="UkePocket"
          description="Personal ukulele practice companion"
        />
        <Row label="Version">
          <span style={{ fontSize: 15, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {__APP_VERSION__}
          </span>
        </Row>
      </Section>

    </div>
  )
}
