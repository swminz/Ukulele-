import { useState, useCallback, useRef } from "react"
import { CHORDS, type ChordData } from "./chords"
import { ChordDiagram } from "./ChordDiagram"
import { X, Search, Heart, ChevronLeft, Plus, ImagePlus, Trash2 } from "lucide-react"

const LS_RECENT    = "uke_chords_recent"
const LS_FAVORITES = "uke_chords_favorites"
const LS_CUSTOM    = "uke_custom_chords"
const MAX_RECENT   = 8

// ── Custom chord type ────────────────────────────────────────────────
export interface CustomChord {
  id:        string
  name:      string
  imageData: string   // base64 data-URL
  createdAt: number
}

function loadRecent():    string[]      { try { return JSON.parse(localStorage.getItem(LS_RECENT)    ?? "[]") } catch { return [] } }
function loadFavorites(): string[]      { try { return JSON.parse(localStorage.getItem(LS_FAVORITES) ?? "[]") } catch { return [] } }
function loadCustom():    CustomChord[] { try { return JSON.parse(localStorage.getItem(LS_CUSTOM)    ?? "[]") } catch { return [] } }

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

function saveCustom(chords: CustomChord[]) {
  localStorage.setItem(LS_CUSTOM, JSON.stringify(chords))
}

// Resize an image File to a max dimension before storing as base64
function resizeImage(file: File, maxPx = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const src = ev.target?.result as string
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
        const w = Math.round(img.width  * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement("canvas")
        canvas.width  = w
        canvas.height = h
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL("image/jpeg", 0.82))
      }
      img.onerror = reject
      img.src = src
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
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
  const [query,         setQuery]        = useState(initialChord ?? "")
  const [tab,           setTab]          = useState<LibTab>("all")
  const [selected,      setSelected]     = useState<ChordData | null>(
    initialChord ? (CHORDS.find((c) => c.name === initialChord) ?? null) : null,
  )
  const [recent,        setRecent]       = useState<string[]>(loadRecent)
  const [favorites,     setFavorites]    = useState<string[]>(loadFavorites)
  const [customChords,  setCustomChords] = useState<CustomChord[]>(loadCustom)
  // Selected custom chord (detail view)
  const [selCustom,     setSelCustom]    = useState<CustomChord | null>(null)
  // Add-chord sheet state
  const [showAdd,       setShowAdd]      = useState(false)
  const [addName,       setAddName]      = useState("")
  const [addImage,      setAddImage]     = useState<string | null>(null)
  const [addSaving,     setAddSaving]    = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const openChord = useCallback((chord: ChordData) => {
    setSelected(chord)
    setRecent(pushRecent(chord.name))
  }, [])

  const toggleFav = useCallback((name: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setFavorites(toggleFavoriteLS(name))
  }, [])

  const handlePickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    try {
      setAddImage(await resizeImage(file))
    } catch {}
  }

  const handleSaveCustom = async () => {
    if (!addName.trim() || !addImage || addSaving) return
    setAddSaving(true)
    const next: CustomChord = {
      id:        `cch_${Date.now()}`,
      name:      addName.trim(),
      imageData: addImage,
      createdAt: Date.now(),
    }
    const updated = [next, ...customChords]
    saveCustom(updated)
    setCustomChords(updated)
    setShowAdd(false)
    setAddName("")
    setAddImage(null)
    setAddSaving(false)
  }

  const handleDeleteCustom = (id: string) => {
    const updated = customChords.filter((c) => c.id !== id)
    saveCustom(updated)
    setCustomChords(updated)
    setSelCustom(null)
    // Also remove from favorites if present
    const updatedFavs = loadFavorites().filter((n) => n !== id)
    localStorage.setItem(LS_FAVORITES, JSON.stringify(updatedFavs))
    setFavorites(updatedFavs)
  }

  const recentChords   = recent.map((n)    => CHORDS.find((c) => c.name === n)).filter(Boolean) as ChordData[]
  const favoriteChords = favorites.map((n) => CHORDS.find((c) => c.name === n)).filter(Boolean) as ChordData[]
  // Custom chords that are favorited
  const favCustom      = customChords.filter((c) => favorites.includes(c.id))

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

  // ── Custom chord detail view ──────────────────────────────────────
  if (selCustom) {
    const isFav = favorites.includes(selCustom.id)
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "8px 8px 8px 4px", borderBottom: "1px solid var(--separator)", flexShrink: 0, gap: 4 }}>
          <button
            onClick={() => setSelCustom(null)}
            style={{ background: "none", border: "none", fontSize: 17, color: "var(--primary)", cursor: "pointer", padding: "8px 8px", display: "flex", alignItems: "center", gap: 2, minHeight: 44 }}
          >
            <ChevronLeft size={20} strokeWidth={2} />
            Chords
          </button>
          <p style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: 600, letterSpacing: "-0.41px" }}>
            {selCustom.name}
          </p>
          <button
            onClick={() => setFavorites(toggleFavoriteLS(selCustom.id))}
            aria-label={isFav ? "Unfavourite" : "Favourite"}
            style={{ background: "none", border: "none", padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", minHeight: 44 }}
          >
            <Heart size={20} strokeWidth={1.5} fill={isFav ? "var(--primary)" : "none"} style={{ color: isFav ? "var(--primary)" : "var(--text-tertiary)" }} />
          </button>
        </div>

        {/* Image */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 24px 16px" }}>
          <img
            src={selCustom.imageData}
            alt={selCustom.name}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 12 }}
          />
        </div>

        {/* Delete */}
        <div style={{ padding: "0 16px calc(var(--safe-bottom) + 16px)", flexShrink: 0 }}>
          <button
            onClick={() => handleDeleteCustom(selCustom.id)}
            style={{
              width: "100%", padding: "13px", background: "rgba(255,59,48,0.08)",
              border: "none", borderRadius: 12, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              color: "var(--destructive)", fontSize: 15, fontWeight: 500,
            }}
          >
            <Trash2 size={16} strokeWidth={1.5} />
            Delete Chord
          </button>
        </div>
      </div>
    )
  }

  // ── Filtered pools per tab ────────────────────────────────────────
  const q = query.toLowerCase()
  const allFiltered    = q ? CHORDS.filter((c) => c.name.toLowerCase().includes(q)) : CHORDS
  const favsFiltered   = q ? favoriteChords.filter((c) => c.name.toLowerCase().includes(q)) : favoriteChords
  const recentFiltered = q ? recentChords.filter((c) => c.name.toLowerCase().includes(q)) : recentChords
  const customFiltered = q ? customChords.filter((c) => c.name.toLowerCase().includes(q)) : customChords
  const favCustomFilt  = q ? favCustom.filter((c) => c.name.toLowerCase().includes(q)) : favCustom

  // ── Grid view ─────────────────────────────────────────────────────
  const TABS: { id: LibTab; label: string }[] = [
    { id: "all",       label: "All Chords"      },
    { id: "favorites", label: "Favourites"       },
    { id: "recent",    label: "Recently Viewed"  },
  ]

  const hasContent =
    tab === "favorites" ? (favsFiltered.length > 0 || favCustomFilt.length > 0) :
    tab === "recent"    ? recentFiltered.length > 0 :
                          (allFiltered.length > 0 || customFiltered.length > 0)

  const emptyMsg =
    q                    ? `No results for "${query}"` :
    tab === "favorites"  ? "No favourites yet" :
    tab === "recent"     ? "No recently viewed chords" :
                           "No chords found"

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" }}>

      {/* ── Top bar: search + add button ── */}
      <div style={{ padding: "10px 16px 0", flexShrink: 0, display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <SearchBar value={query} onChange={setQuery} />
        </div>
        <button
          onClick={() => setShowAdd(true)}
          aria-label="Add custom chord"
          style={{
            width:         40,
            height:        36,
            borderRadius:  10,
            background:    "var(--primary)",
            border:        "none",
            cursor:        "pointer",
            display:       "flex",
            alignItems:    "center",
            justifyContent:"center",
            flexShrink:    0,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Plus size={20} strokeWidth={2.2} style={{ color: "#FFF" }} />
        </button>
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

      {/* ── Grid content ── */}
      <div className="scroll-content" style={{ flex: 1, overflowY: "auto", padding: "16px 16px calc(var(--safe-bottom) + 32px)" }}>
        {!hasContent ? (
          <div style={{ paddingTop: 64, textAlign: "center" }}>
            <p style={{ fontSize: 17, color: "var(--text-tertiary)" }}>{emptyMsg}</p>
            {!q && (tab === "favorites" || tab === "recent") && (
              <p style={{ fontSize: 15, color: "var(--text-tertiary)", marginTop: 6, opacity: 0.7 }}>
                {tab === "favorites" ? "Tap the heart on any chord to save it." : "Open a chord to add it here."}
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Custom chords section (All + Favourites tabs only) */}
            {tab !== "recent" && (tab === "all" ? customFiltered : favCustomFilt).length > 0 && (
              <div>
                <p className="section-label" style={{ paddingLeft: 4, marginBottom: 8 }}>My Chords</p>
                <CustomChordGrid
                  chords={tab === "all" ? customFiltered : favCustomFilt}
                  favorites={favorites}
                  onOpen={setSelCustom}
                  onToggleFav={(id, e) => { e?.stopPropagation(); setFavorites(toggleFavoriteLS(id)) }}
                />
              </div>
            )}

            {/* Built-in chords */}
            {(tab === "all"       ? allFiltered    :
              tab === "favorites" ? favsFiltered   :
                                    recentFiltered ).length > 0 && (
              <div>
                {tab !== "recent" && (tab === "all" ? customFiltered : favCustomFilt).length > 0 && (
                  <p className="section-label" style={{ paddingLeft: 4, marginBottom: 8 }}>Chord Library</p>
                )}
                <ChordGrid
                  chords={
                    tab === "all"       ? allFiltered    :
                    tab === "favorites" ? favsFiltered   :
                                         recentFiltered
                  }
                  favorites={favorites}
                  onOpen={openChord}
                  onToggleFav={toggleFav}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Hidden file input ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handlePickImage}
        aria-hidden
      />

      {/* ── Add chord bottom sheet ── */}
      {showAdd && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.4)" }}
            onClick={() => { setShowAdd(false); setAddName(""); setAddImage(null) }}
          />
          <div
            className="sheet-slide-up"
            role="dialog"
            aria-modal
            aria-label="Add custom chord"
            style={{
              position:      "fixed",
              bottom:        0,
              left:          0,
              right:         0,
              zIndex:        201,
              background:    "var(--background)",
              borderRadius:  "20px 20px 0 0",
              padding:       "0 0 calc(env(safe-area-inset-bottom) + 16px)",
            }}
          >
            {/* Handle */}
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
              <div style={{ width: 36, height: 5, borderRadius: 3, background: "rgba(120,120,128,0.3)" }} />
            </div>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 16px 16px" }}>
              <p style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.41px" }}>Add Chord</p>
              <button
                onClick={() => { setShowAdd(false); setAddName(""); setAddImage(null) }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}
              >
                <X size={18} style={{ color: "var(--text-tertiary)" }} />
              </button>
            </div>

            <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Name input */}
              <div>
                <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 6, fontWeight: 500 }}>Chord Name</p>
                <input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Bm, F#7, Cadd9"
                  style={{
                    width:        "100%",
                    padding:      "11px 14px",
                    borderRadius: 10,
                    border:       "1px solid var(--separator)",
                    background:   "var(--card)",
                    color:        "var(--foreground)",
                    fontSize:     17,
                    outline:      "none",
                    fontFamily:   "inherit",
                    boxSizing:    "border-box",
                  }}
                />
              </div>

              {/* Image picker */}
              <div>
                <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 6, fontWeight: 500 }}>Chord Diagram Photo</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    width:          "100%",
                    height:         180,
                    borderRadius:   12,
                    border:         `2px dashed ${addImage ? "transparent" : "var(--separator)"}`,
                    background:     addImage ? "transparent" : "var(--card)",
                    cursor:         "pointer",
                    display:        "flex",
                    flexDirection:  "column",
                    alignItems:     "center",
                    justifyContent: "center",
                    gap:            8,
                    overflow:       "hidden",
                    padding:        0,
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {addImage ? (
                    <img src={addImage} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  ) : (
                    <>
                      <ImagePlus size={32} strokeWidth={1.2} style={{ color: "var(--text-tertiary)" }} />
                      <span style={{ fontSize: 14, color: "var(--text-tertiary)", fontWeight: 500 }}>Tap to add photo</span>
                    </>
                  )}
                </button>
                {addImage && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{ background: "none", border: "none", color: "var(--primary)", fontSize: 14, fontWeight: 500, cursor: "pointer", marginTop: 6, padding: 0 }}
                  >
                    Change photo
                  </button>
                )}
              </div>

              {/* Save button */}
              <button
                onClick={handleSaveCustom}
                disabled={!addName.trim() || !addImage || addSaving}
                style={{
                  width:        "100%",
                  padding:      "14px",
                  borderRadius: 12,
                  border:       "none",
                  background:   (!addName.trim() || !addImage) ? "rgba(0,122,255,0.3)" : "var(--primary)",
                  color:        "#FFF",
                  fontSize:     17,
                  fontWeight:   600,
                  cursor:       (!addName.trim() || !addImage) ? "not-allowed" : "pointer",
                  transition:   "background 0.15s",
                }}
              >
                {addSaving ? "Saving…" : "Add Chord"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Custom chord grid ─────────────────────────────────────────────────────────
function CustomChordGrid({
  chords,
  favorites,
  onOpen,
  onToggleFav,
}: {
  chords:      CustomChord[]
  favorites:   string[]
  onOpen:      (c: CustomChord) => void
  onToggleFav: (id: string, e?: React.MouseEvent) => void
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
      {chords.map((chord) => {
        const isFav = favorites.includes(chord.id)
        return (
          <button
            key={chord.id}
            onClick={() => onOpen(chord)}
            aria-label={`View ${chord.name} chord`}
            style={{
              background:    "var(--card)",
              border:        "none",
              borderRadius:  14,
              padding:       "12px 8px 10px",
              display:       "flex",
              flexDirection: "column",
              alignItems:    "center",
              gap:           6,
              cursor:        "pointer",
              position:      "relative",
              minHeight:     96,
              transition:    "transform 0.12s ease",
              overflow:      "hidden",
            }}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.95)" }}
            onPointerUp={(e)   => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"    }}
            onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"  }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.1px" }}>
              {chord.name}
            </span>
            <img
              src={chord.imageData}
              alt={chord.name}
              style={{ width: "100%", flex: 1, objectFit: "contain", borderRadius: 6 }}
            />
            <button
              onClick={(e) => onToggleFav(chord.id, e)}
              aria-label={isFav ? "Unfavourite" : "Favourite"}
              style={{ position: "absolute", top: 0, right: 0, padding: "10px 10px 6px 6px", background: "none", border: "none", cursor: "pointer" }}
            >
              <Heart size={12} strokeWidth={1.5} fill={isFav ? "var(--primary)" : "none"} style={{ color: isFav ? "var(--primary)" : "rgba(120,120,128,0.4)" }} />
            </button>
          </button>
        )
      })}
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
