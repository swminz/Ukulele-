import { useState, useEffect } from "react"
import { PracticeTab } from "@/modules/practice/PracticeTab"
import { ChordLog } from "@/modules/chord-log/ChordLog"
import { ChordLibrary } from "@/modules/chord-library/ChordLibrary"
import { Settings } from "@/modules/settings/Settings"
import { migratePDFsToSongs } from "@/lib/db"
import { stopString } from "@/lib/audio"
import { Music2, BookOpen, Grid3x3, Settings as SettingsIcon, Plus } from "lucide-react"

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

export default function App() {
  const [tab, setTab] = useState<TabId>(() => {
    try {
      const s = localStorage.getItem("ukepocket_last_tab")
      if (s === "practice" || s === "songs" || s === "chords" || s === "settings") return s as TabId
    } catch {}
    return "practice"
  })

  // Incrementing trigger to tell ChordLog to open the new-song editor
  const [addSongTrigger, setAddSongTrigger] = useState(0)

  useEffect(() => { localStorage.setItem("ukepocket_last_tab", tab) }, [tab])

  const handleTabChange = (id: TabId) => {
    if (tab === "practice" && id !== "practice") stopString()
    setTab(id)
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
          paddingTop:    "calc(env(safe-area-inset-top) + 10px)",
          paddingBottom: 12,
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

        {/* Right action — only visible on Songs tab */}
        {tab === "songs" && (
          <button
            onClick={() => setAddSongTrigger((n) => n + 1)}
            aria-label="Add song"
            style={{
              background:      "var(--primary)",
              color:           "#FFFFFF",
              border:          "none",
              borderRadius:    "50%",
              width:           32,
              height:          32,
              display:         "flex",
              alignItems:      "center",
              justifyContent:  "center",
              cursor:          "pointer",
              flexShrink:      0,
              transition:      "opacity 0.12s ease, transform 0.12s ease",
            }}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.9)" }}
            onPointerUp={(e)   => { (e.currentTarget as HTMLElement).style.transform = "scale(1)" }}
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        )}
      </header>

      {/* ── Tab content ───────────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {tab === "practice" && <PracticeTab />}

        {tab === "songs" && (
          <div className="h-full flex flex-col overflow-hidden">
            <ChordLog addTrigger={addSongTrigger} />
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
            style={{ height: "100%", overflowY: "auto", paddingTop: 8 }}
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
