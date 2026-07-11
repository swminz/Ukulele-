import { useState } from "react"
import { exportBackup, importBackup } from "@/lib/db"
import { useSettings } from "@/hooks/use-settings"
import { useTheme } from "@/components/theme-provider"
import type { AppSettings } from "@/types"
import {
  Sun, Moon, Bell, Smartphone, Type,
  Timer, Download, Upload, Info, ChevronRight,
} from "lucide-react"

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

// ── Icon badge — colored pill matching Apple Settings icons ───────────────────
function Badge({
  children,
  color,
}: {
  children: React.ReactNode
  color: string
}) {
  return (
    <div
      style={{
        width:           32,
        height:          32,
        borderRadius:    8,
        background:      color,
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        flexShrink:      0,
      }}
    >
      {children}
    </div>
  )
}

// ── Settings row ──────────────────────────────────────────────────────────────
function Row({
  badge,
  label,
  description,
  children,
  onClick,
}: {
  badge?: React.ReactNode
  label: string
  description?: string
  children?: React.ReactNode
  onClick?: () => void
}) {
  const isButton = Boolean(onClick)
  const Tag = isButton ? "button" : "div"
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

// ── Icon colors (Apple Settings palette) ──────────────────────────────────────
const C = {
  blue:   "#007AFF",
  green:  "#34C759",
  orange: "#FF9F0A",
  purple: "#AF52DE",
  red:    "#FF3B30",
  teal:   "#5AC8FA",
  gray:   "#8E8E93",
}

const ICON_STYLE = { color: "#FFFFFF" }

export function Settings() {
  const { settings, updateSettings } = useSettings()
  const { theme, setTheme } = useTheme()
  const [exportMsg, setExportMsg] = useState("")
  const [importMsg, setImportMsg] = useState("")

  const set = (patch: Partial<AppSettings>) => updateSettings(patch)

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
    const input   = document.createElement("input")
    input.type    = "file"
    input.accept  = ".json,application/json"
    input.onchange = async () => {
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

  return (
    <div style={{ padding: "8px 16px 56px" }}>

      {/* ── Appearance ── */}
      <Section label="Appearance">
        <Row
          badge={
            <Badge color={theme === "dark" ? C.gray : C.blue}>
              {theme === "dark"
                ? <Moon size={16} style={ICON_STYLE} />
                : <Sun  size={16} style={ICON_STYLE} />}
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
        <Row
          badge={<Badge color={C.purple}><Type size={16} style={ICON_STYLE} /></Badge>}
          label="Large Text"
          description="Increase UI text size"
        >
          <Toggle value={settings.largeText} onChange={(v) => set({ largeText: v })} />
        </Row>
      </Section>

      {/* ── Practice ── */}
      <Section label="Practice">
        <Row
          badge={<Badge color={C.orange}><Smartphone size={16} style={ICON_STYLE} /></Badge>}
          label="Keep Screen Awake"
          description="Prevent auto-lock while practicing"
        >
          <Toggle value={settings.keepScreenAwake} onChange={(v) => set({ keepScreenAwake: v })} />
        </Row>
        <Row
          badge={<Badge color={C.teal}><Bell size={16} style={ICON_STYLE} /></Badge>}
          label="Haptic Feedback"
          description="Vibrate on beats and actions"
        >
          <Toggle value={settings.hapticFeedback} onChange={(v) => set({ hapticFeedback: v })} />
        </Row>
        <Row
          badge={<Badge color={C.green}><Timer size={16} style={ICON_STYLE} /></Badge>}
          label="Auto-scroll Speed"
          description={`${settings.autoScrollSpeed} px / sec`}
        >
          <input
            type="range"
            min={10}
            max={120}
            value={settings.autoScrollSpeed}
            onChange={(e) => set({ autoScrollSpeed: Number(e.target.value) })}
            aria-label="Auto-scroll speed"
            style={{
              width:      96,
              background: `linear-gradient(to right, var(--primary) ${((settings.autoScrollSpeed - 10) / 110) * 100}%, rgba(120,120,128,0.2) 0%)`,
            }}
          />
        </Row>
      </Section>

      {/* ── Data ── */}
      <Section label="Data">
        <Row
          badge={<Badge color={C.blue}><Download size={16} style={ICON_STYLE} /></Badge>}
          label="Export Backup"
          description={exportMsg || "Download all songs as a JSON file"}
          onClick={handleExport}
        />
        <Row
          badge={<Badge color={C.blue}><Upload size={16} style={ICON_STYLE} /></Badge>}
          label="Import Backup"
          description={importMsg || "Restore songs from a backup file"}
          onClick={handleImport}
        />
      </Section>

      {/* ── About ── */}
      <Section label="About">
        <Row
          badge={<Badge color={C.blue}><Info size={16} style={ICON_STYLE} /></Badge>}
          label="UkePocket"
          description="Personal ukulele practice companion"
        >
          <span style={{ fontSize: 15, color: "var(--text-tertiary)" }}>v1.0</span>
        </Row>
        <div className="grouped-row">
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", lineHeight: "18px" }}>
            All data is stored locally on your device. No accounts, no cloud, no internet required.
          </p>
        </div>
        <div className="grouped-row" style={{ justifyContent: "space-between" }}>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", lineHeight: "18px" }}>
            Developed by
          </p>
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)", letterSpacing: "-0.1px" }}>
            Swati Minz
          </p>
        </div>
      </Section>

    </div>
  )
}
