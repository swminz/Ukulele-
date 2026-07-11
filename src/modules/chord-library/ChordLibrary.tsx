import { useState, useCallback, useRef } from "react"
import { CHORDS, type ChordData } from "./chords"
import { ChordDiagram } from "./ChordDiagram"
import { X, Search, Heart, ChevronLeft } from "lucide-react"

const LS_RECENT    = "uke_chords_recent"
const LS_FAVORITES = "uke_chords_favorites"
const MAX_RECENT   = 8

function loadRecent():    string[] { try { return JSON.parse(localStorage.getItem(LS_RECENT)    ?? "[]") } catch { return [] } }
function loadFavorites(): string[] { try { return JSON.parse(localStorage.getItem(LS_FAVORITES) ?? "[]") } catch { return [] } }

function pushRecent(name: string): string[] {
  const next = [name, ...loadRecent().filter((n) => n !== name)].slice(0, MAX_RECENT)
  localStorage.setItem(LS_RECENT, JSON.stringify(next))
  return next
}

function toggleFavoriteLS(name: string): string[] {
  const prev = loadFavorites()
  const next  = prev.includes(name) ? prev.filter((n) => n !== name) : [name, ...prev]
  localStorage.setItem(LS_FAVORITES, JSON.stringify(next))
  return next
}

interface Props {
  initialChord?: string
  onClose?: () => void
}

// ── iOS-style search bar ────────────────────────────────────────────
function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="ios-search-wrap">
      <div className="ios-search-field">
        <span className="ios-search-icon">
          <Search size={15} />
        </span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search chords"
          aria-label="Search chords"
          className="ios-input"
        />
        {value && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onChange(""); inputRef.current?.focus() }}
            aria-label="Clear search"
            className="ios-clear-btn"
          >
            <X size={10} strokeWidth={2.5} />
          </button>
        )}
      </div>
      {focused && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onChange(""); inputRef.current?.blur() }}
          className="ios-cancel-btn"
        >
          Cancel
        </button>
      )}
    </div>
  )
}

type LibTab = "all" | "favorites" | "recent"

export function ChordLibrary({ initialChord, onClose }: Props) {
  const [query,     setQuery]     = useState(initialChord ?? "")
  const [tab,       setTab]       = useState<LibTab>("all")
  const [selected,  setSelected]  = useState<ChordData | null>(
    initialChord ? (CHORDS.find((c) => c.name === initialChord) ?? null) : null,
  )
  const [recent,    setRecent]    = useState<string[]>(loadRecent)
  const [favorites, setFavorites] = useState<string[]>(loadFavorites)

  const openChord = useCallback((chord: ChordData) => {
    setSelected(chord)
    setRecent(pushRecent(chord.name))
  }, [])

  const toggleFav = useCallback((name: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setFavorites(toggleFavoriteLS(name))
  }, [])

  const recentChords   = recent.map((n)    => CHORDS.find((c) => c.name === n)).filter(Boolean) as ChordData[]
  const favoriteChords = favorites.map((n) => CHORDS.find((c) => c.name === n)).filter(Boolean) as ChordData[]

  // ── Quick-view popup (when opened from a song) ─────────────────────
  if (selected && onClose) {
    return (
      <div
        onClick={onClose}
        style={{
          position:        "fixed",
          inset:           0,
          zIndex:          50,
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
          background:      "rgba(0,0,0,0.4)",
          backdropFilter:  "blur(8px)",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background:     "var(--card)",
            borderRadius:   20,
            padding:        24,
            margin:         24,
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            gap:            16,
            minWidth:       260,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px" }}>{selected.display}</p>
            <button onClick={onClose} aria-label="Close" className="icon-btn">
              <X size={14} />
            </button>
          </div>
          <ChordDiagram chord={selected} size="lg" />
          <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>
            {selected.frets.map((f, i) => `${"GCEA"[i]}=${f === 0 ? "open" : f}`).join(" · ")}
          </p>
        </div>
      </div>
    )
  }

  // ── Chord detail view ──────────────────────────────────────────────
  if (selected) {
    const isFav = favorites.includes(selected.name)
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" }}>
        {/* Nav row */}
        <div
          style={{
            display:       "flex",
            alignItems:    "center",
            padding:       "8px 8px 8px 4px",
            borderBottom:  "1px solid var(--separator)",
            flexShrink:    0,
            gap:           4,
          }}
        >
          <button
            onClick={() => setSelected(null)}
            style={{
              background:     "none",
              border:         "none",
              fontSize:       17,
              color:          "var(--primary)",
              cursor:         "pointer",
              padding:        "8px 8px",
              letterSpacing:  "-0.41px",
              display:        "flex",
              alignItems:     "center",
              gap:            2,
              minHeight:      44,
            }}
          >
            <ChevronLeft size={20} strokeWidth={2} />
            Chords
          </button>
          <p
            style={{
              flex:          1,
              textAlign:     "center",
              fontSize:      17,
              fontWeight:    600,
              letterSpacing: "-0.41px",
            }}
          >
            {selected.display}
          </p>
          <button
            onClick={(e) => toggleFav(selected.name, e)}
            aria-label={isFav ? "Unfavorite" : "Favorite"}
            style={{
              background:      "none",
              border:          "none",
              padding:         "8px 12px",
              cursor:          "pointer",
              display:         "flex",
              alignItems:      "center",
              minHeight:       44,
            }}
          >
            <Heart
              size={20}
              strokeWidth={1.5}
              fill={isFav ? "var(--primary)" : "none"}
              style={{ color: isFav ? "var(--primary)" : "var(--text-tertiary)" }}
            />
          </button>
        </div>

        {/* Diagram — fills the available height, diagram as large as possible */}
        <div
          style={{
            flex:            1,
            display:         "flex",
            flexDirection:   "column",
            alignItems:      "center",
            justifyContent:  "center",
            gap:             16,
            padding:         "16px 24px calc(var(--safe-bottom) + 16px)",
          }}
        >
          <ChordDiagram chord={selected} size="xl" />
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 4 }}>
            <p style={{ fontSize: 15, color: "var(--text-tertiary)" }}>G · C · E · A tuning</p>
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              Frets: {selected.frets.join("-")}
              {selected.baseFret && selected.baseFret > 1 ? ` (base fret ${selected.baseFret})` : ""}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Filtered pools per tab ────────────────────────────────────────
  const q = query.toLowerCase()
  const allFiltered      = q ? CHORDS.filter((c) => c.name.toLowerCase().includes(q)) : CHORDS
  const favsFiltered     = q ? favoriteChords.filter((c) => c.name.toLowerCase().includes(q)) : favoriteChords
  const recentFiltered   = q ? recentChords.filter((c) => c.name.toLowerCase().includes(q)) : recentChords

  // ── Grid view ─────────────────────────────────────────────────────
  const TABS: { id: LibTab; label: string }[] = [
    { id: "all",       label: "All Chords"      },
    { id: "favorites", label: "Favourites"       },
    { id: "recent",    label: "Recently Viewed"  },
  ]

  const activeChords =
    tab === "favorites" ? favsFiltered :
    tab === "recent"    ? recentFiltered :
                          allFiltered

  const emptyMsg =
    q                    ? `No results for "${query}"` :
    tab === "favorites"  ? "No favourites yet" :
    tab === "recent"     ? "No recently viewed chords" :
                           "No chords found"

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" }}>
      {/* Search */}
      <div style={{ padding: "10px 16px 0", flexShrink: 0 }}>
        <SearchBar value={query} onChange={setQuery} />
      </div>

      {/* ── Underline tab bar ── */}
      <div style={{ display: "flex", flexShrink: 0, borderBottom: "1px solid var(--separator)", marginTop: 6 }}>
        {TABS.map(({ id, label }) => {
          const active = tab === id
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-pressed={active}
              style={{
                flex:          1,
                padding:       "13px 0 11px",
                background:    "none",
                border:        "none",
                borderBottom:  active ? "2px solid var(--primary)" : "2px solid transparent",
                marginBottom:  -1,
                color:         active ? "var(--primary)" : "var(--text-tertiary)",
                fontSize:      13,
                fontWeight:    active ? 600 : 400,
                letterSpacing: "-0.1px",
                cursor:        "pointer",
                transition:    "color 0.15s ease, border-color 0.15s ease",
                whiteSpace:    "nowrap",
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Grid */}
      <div className="scroll-content" style={{ flex: 1, overflowY: "auto", padding: "16px 16px calc(var(--safe-bottom) + 32px)" }}>
        {activeChords.length === 0 ? (
          <div style={{ paddingTop: 64, textAlign: "center" }}>
            <p style={{ fontSize: 17, color: "var(--text-tertiary)" }}>{emptyMsg}</p>
            {!q && (tab === "favorites" || tab === "recent") && (
              <p style={{ fontSize: 15, color: "var(--text-tertiary)", marginTop: 6, opacity: 0.7 }}>
                {tab === "favorites" ? "Tap the heart on any chord to save it." : "Open a chord to add it here."}
              </p>
            )}
          </div>
        ) : (
          <ChordGrid chords={activeChords} favorites={favorites} onOpen={openChord} onToggleFav={toggleFav} />
        )}
      </div>
    </div>
  )
}

function ChordGrid({
  chords,
  favorites,
  onOpen,
  onToggleFav,
}: {
  chords: ChordData[]
  favorites: string[]
  onOpen: (c: ChordData) => void
  onToggleFav: (name: string, e?: React.MouseEvent) => void
}) {
  return (
    <div
      style={{
        display:               "grid",
        gridTemplateColumns:   "repeat(3, 1fr)",  /* 3-col grid for larger, touch-friendly cards */
        gap:                   10,
      }}
    >
      {chords.map((chord) => {
        const isFav = favorites.includes(chord.name)
        return (
          <button
            key={chord.name}
            onClick={() => onOpen(chord)}
            aria-label={`View ${chord.display} chord`}
            style={{
              background:     "var(--card)",
              border:         "none",
              borderRadius:   14,
              padding:        "14px 8px 12px",
              display:        "flex",
              flexDirection:  "column",
              alignItems:     "center",
              gap:            8,
              cursor:         "pointer",
              position:       "relative",
              minHeight:      96,
              transition:     "transform 0.12s ease",
            }}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.95)" }}
            onPointerUp={(e)   => { (e.currentTarget as HTMLElement).style.transform = "scale(1)" }}
            onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)" }}
          >
            <span
              style={{
                fontSize:      14,
                fontWeight:    600,
                color:         "var(--foreground)",
                letterSpacing: "-0.1px",
              }}
            >
              {chord.display}
            </span>
            <ChordDiagram chord={chord} size="sm" />

            {/* Heart — tap target extended with padding */}
            <button
              onClick={(e) => onToggleFav(chord.name, e)}
              aria-label={isFav ? "Unfavorite" : "Favorite"}
              style={{
                position:  "absolute",
                top:       0,
                right:     0,
                padding:   "10px 10px 6px 6px",
                background:"none",
                border:    "none",
                cursor:    "pointer",
              }}
            >
              <Heart
                size={12}
                strokeWidth={1.5}
                fill={isFav ? "var(--primary)" : "none"}
                style={{ color: isFav ? "var(--primary)" : "rgba(120,120,128,0.4)" }}
              />
            </button>
          </button>
        )
      })}
    </div>
  )
}
