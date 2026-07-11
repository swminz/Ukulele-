import { useState, useEffect, useRef } from "react"
import { PracticeTab } from "@/modules/practice/PracticeTab"
import { ChordLog } from "@/modules/chord-log/ChordLog"
import { ChordLibrary } from "@/modules/chord-library/ChordLibrary"
import { Settings } from "@/modules/settings/Settings"
import { migratePDFsToSongs } from "@/lib/db"
import { stopString } from "@/lib/audio"
import {
  Music2, BookOpen, Grid3x3, Settings as SettingsIcon, Plus,
  Music, FilePlus,
} from "lucide-react"

void migratePDFsToSongs()

type TabId = "practice" | "songs" | "chords" | "settings"

type IconProps = {
  size?: number
  strokeWidth?: number
  style?: React.CSSProperties
  className?: string
}

const TABS: { id: TabId; label: string; icon: React.ComponentType<IconProps> }[] = [
  { id: "practice", label: "Practice", icon: Music2        },
  { id: "songs",    label: "Songs",    icon: BookOpen      },
  { id: "chords",   label: "Chords",   icon: Grid3x3       },
  { id: "settings", label: "Settings", icon: SettingsIcon  },
]

const TAB_TITLES: Record<TabId, string> = {
  practice: "Practice",
  songs:    "Songs",
  chords:   "Chords",
  settings: "Settings",
}

// ── iOS-style context menu ─────────────────────────────────────────────────────
interface MenuOption {
  id:      string
  label:   string
  icon:    React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>
  color?:  string
}

interface ContextMenuProps {
  options:   MenuOption[]
  onSelect:  (id: string) => void
  onDismiss: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}

function ContextMenu({ options, onSelect, onDismiss, anchorRef }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Position the menu below-left of the anchor button
  const [pos, setPos] = useState({ top: 0, right: 0 })
  useEffect(() => {
    const btn = anchorRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    setPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
  }, [anchorRef])

  // Dismiss on outside tap
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onDismiss()
      }
    }
    document.addEventListener("pointerdown", handler, true)
    return () => document.removeEventListener("pointerdown", handler, true)
  }, [onDismiss, anchorRef])

  return (
    <>
      {/* Scrim */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 200 }}
        onClick={onDismiss}
      />
      {/* Menu card */}
      <div
        ref={menuRef}
        role="menu"
        aria-label="Add options"
        style={{
          position:     "fixed",
          top:          pos.top,
          right:        pos.right,
          zIndex:       201,
          minWidth:     200,
          background:   "var(--card)",
          borderRadius: 14,
          boxShadow:    "0 4px 32px rgba(0,0,0,0.16), 0 0 0 0.5px rgba(60,60,67,0.18)",
          overflow:     "hidden",
          animation:    "ctxMenuIn 0.18s cubic-bezier(0.22,1,0.36,1) both",
          transformOrigin: "top right",
        }}
      >
        {options.map((opt, i) => (
          <button
            key={opt.id}
            role="menuitem"
            onClick={() => { onSelect(opt.id); onDismiss() }}
            style={{
              display:       "flex",
              alignItems:    "center",
              justifyContent:"space-between",
              width:         "100%",
              padding:       "13px 16px",
              background:    "transparent",
              border:        "none",
              borderTop:     i > 0 ? "0.5px solid rgba(60,60,67,0.14)" : "none",
              cursor:        "pointer",
              fontFamily:    "inherit",
              textAlign:     "left",
              gap:           12,
              transition:    "background 0.1s ease",
            }}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(60,60,67,0.06)" }}
            onPointerUp={(e)   => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
            onPointerLeave={(e)=> { (e.currentTarget as HTMLElement).style.background = "transparent" }}
          >
            <span style={{ fontSize: 16, fontWeight: 400, letterSpacing: "-0.2px", color: "var(--foreground)" }}>
              {opt.label}
            </span>
            <opt.icon
              size={20}
              strokeWidth={1.6}
              style={{ color: opt.color ?? "var(--primary)", flexShrink: 0 }}
            />
          </button>
        ))}
      </div>
      <style>{`
        @keyframes ctxMenuIn {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1);    }
        }
      `}</style>
    </>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState<TabId>(() => {
    try {
      const s = localStorage.getItem("ukepocket_last_tab")
      if (s === "practice" || s === "songs" || s === "chords" || s === "settings") return s as TabId
    } catch {}
    return "practice"
  })

  // Incrementing trigger to tell ChordLog to open the new-song editor
  const [addSongTrigger,    setAddSongTrigger]    = useState(0)
  // Incrementing trigger to tell ChordLog to open the file picker
  const [uploadMusicTrigger, setUploadMusicTrigger] = useState(0)
  const [showMenu,          setShowMenu]           = useState(false)

  const addBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { localStorage.setItem("ukepocket_last_tab", tab) }, [tab])

  const handleTabChange = (id: TabId) => {
    if (tab === "practice" && id !== "practice") stopString()
    setTab(id)
  }

  const MENU_OPTIONS: MenuOption[] = [
    { id: "upload", label: "Upload Music", icon: Music,    color: "var(--primary)" },
    { id: "add",    label: "Add Song",     icon: FilePlus, color: "var(--primary)" },
  ]

  const handleMenuSelect = (id: string) => {
    if (id === "add") {
      setTab("songs")
      setAddSongTrigger((n) => n + 1)
    } else if (id === "upload") {
      setTab("songs")
      setUploadMusicTrigger((n) => n + 1)
    }
  }

  return (
    <div
      className="app-shell flex flex-col"
      style={{ height: "100dvh", background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* ── Navigation bar ────────────────────────────────────────────── */}
      <header
        className="ios-header shrink-0 flex items-center justify-between"
        style={{
          paddingTop:    "calc(env(safe-area-inset-top) + 4px)",
          paddingBottom: 8,
          paddingLeft:   20,
          paddingRight:  16,
        }}
      >
        <h1
          style={{
            fontSize:      28,
            fontWeight:    700,
            letterSpacing: "-0.5px",
            lineHeight:    "34px",
            color:         "var(--foreground)",
          }}
        >
          {TAB_TITLES[tab]}
        </h1>

        {/* + button — visible on Songs tab */}
        {tab === "songs" && (
          <button
            ref={addBtnRef}
            onClick={() => setShowMenu((v) => !v)}
            aria-label="Add song or upload"
            aria-haspopup="menu"
            aria-expanded={showMenu}
            style={{
              background:     showMenu ? "rgba(0,122,255,0.8)" : "var(--primary)",
              color:          "#FFFFFF",
              border:         "none",
              borderRadius:   "50%",
              width:          32,
              height:         32,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              cursor:         "pointer",
              flexShrink:     0,
              transition:     "background 0.15s ease, transform 0.12s ease",
              transform:      showMenu ? "rotate(45deg)" : "rotate(0deg)",
            }}
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        )}
      </header>

      {/* Context menu */}
      {showMenu && tab === "songs" && (
        <ContextMenu
          options={MENU_OPTIONS}
          onSelect={handleMenuSelect}
          onDismiss={() => setShowMenu(false)}
          anchorRef={addBtnRef}
        />
      )}

      {/* ── Tab content ───────────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {tab === "practice" && <PracticeTab />}

        {tab === "songs" && (
          <div className="h-full flex flex-col overflow-hidden">
            <ChordLog
              addTrigger={addSongTrigger}
              uploadTrigger={uploadMusicTrigger}
            />
          </div>
        )}

        {tab === "chords" && (
          <div className="h-full flex flex-col overflow-hidden">
            <ChordLibrary />
          </div>
        )}

        {tab === "settings" && (
          <div
            className="scroll-content"
            style={{ height: "100%", overflowY: "auto", paddingTop: 8, paddingBottom: "calc(var(--safe-bottom) + 24px)" }}
          >
            <Settings />
          </div>
        )}
      </main>

      {/* ── Bottom tab bar ────────────────────────────────────────────── */}
      <nav className="bottom-nav shrink-0 flex" aria-label="Main navigation">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className="flex-1 flex flex-col items-center justify-center gap-1"
              style={{
                paddingTop:    10,
                paddingBottom: 4,
                minHeight:     56,
                background:    "transparent",
                border:        "none",
                cursor:        "pointer",
                color:         active ? "var(--primary)" : "var(--text-tertiary)",
                transition:    "color 0.15s ease",
              }}
            >
              <Icon
                size={24}
                strokeWidth={active ? 2 : 1.5}
                style={{ transition: "all 0.15s ease" }}
              />
              <span
                style={{
                  fontSize:      10,
                  fontWeight:    active ? 600 : 400,
                  letterSpacing: "0.2px",
                  lineHeight:    "12px",
                  transition:    "all 0.15s ease",
                }}
              >
                {label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
