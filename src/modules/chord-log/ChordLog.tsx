import { useState, useEffect, useRef } from "react"
import { getAllSongs, saveSong } from "@/lib/db"
import { haptic } from "@/lib/audio"
import type { Song } from "@/types"
import { SongCard } from "./SongCard"
import { SongModal } from "./SongModal"
import { SongEditor } from "./SongEditor"
import { Search, X } from "lucide-react"

function makeId() { return `song_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }

function newSong(): Song {
  const now = Date.now()
  return { id: makeId(), title: "", artist: "", content: "", createdAt: now, modifiedAt: now, favorite: false }
}

// ── iOS-style search bar with Cancel button ─────────────────────────
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
          placeholder="Search"
          aria-label="Search songs"
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

interface Props {
  addTrigger?: number
}

export function ChordLog({ addTrigger }: Props) {
  const [songs,      setSongs]      = useState<Song[]>([])
  const [query,      setQuery]      = useState("")
  const [viewSong,   setViewSong]   = useState<Song | null>(null)
  const [editSong,   setEditSong]   = useState<Song | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const load = async () => setSongs(await getAllSongs())
  useEffect(() => { void load() }, [])

  // Open new-song editor whenever the parent increments addTrigger
  const prevTrigger = useRef(0)
  useEffect(() => {
    if (!addTrigger || addTrigger === prevTrigger.current) return
    prevTrigger.current = addTrigger
    handleCreate()
  }, [addTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = songs.filter((s) => {
    const q = query.toLowerCase()
    return (
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q) ||
      (s.album ?? "").toLowerCase().includes(q)
    )
  })

  const favorites    = filtered.filter((s) => s.favorite)
  const nonFavorites = filtered.filter((s) => !s.favorite)

  const handleCreate = () => {
    haptic(10)
    const s = newSong()
    setEditSong(s)
    setIsCreating(true)
  }

  const handleSave = async (song: Song) => {
    await saveSong(song)
    await load()
    if (isCreating) { setIsCreating(false); setEditSong(null); setViewSong(song) }
    else { setEditSong(null); setViewSong(song) }
  }

  const handleDeleted = async () => { await load(); setViewSong(null) }

  const handleToggleFavorite = async (song: Song) => {
    const updated = { ...song, favorite: !song.favorite, modifiedAt: Date.now() }
    await saveSong(updated)
    setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
    if (viewSong?.id === updated.id) setViewSong(updated)
  }

  const handleDuplicate = async (dup: Song) => {
    await saveSong(dup)
    await load()
    setViewSong(null)
  }

  if (editSong) {
    return (
      <SongEditor
        song={editSong}
        onSave={handleSave}
        onCancel={() => { setEditSong(null); setIsCreating(false) }}
      />
    )
  }

  return (
    <>
      <div
        style={{
          flex:           1,
          display:        "flex",
          flexDirection:  "column",
          overflow:       "hidden",
          background:     "var(--background)",
        }}
      >
        {/* ── Search bar ── */}
        <div style={{ padding: "10px 16px 12px", flexShrink: 0 }}>
          <SearchBar value={query} onChange={setQuery} />
        </div>

        {/* ── List ── */}
        <div
          className="scroll-content"
          style={{ flex: 1, overflowY: "auto", padding: "0 16px 48px" }}
        >
          {songs.length === 0 ? (
            <div
              style={{
                display:        "flex",
                flexDirection:  "column",
                alignItems:     "center",
                justifyContent: "center",
                height:         280,
                textAlign:      "center",
                gap:            10,
              }}
            >
              <p style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)" }}>
                No songs yet
              </p>
              <p style={{ fontSize: 15, color: "var(--text-tertiary)", maxWidth: 240, lineHeight: "20px" }}>
                Tap + to add your first song with chords, lyrics, or sheet music.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", paddingTop: 64 }}>
              <p style={{ fontSize: 17, color: "var(--text-tertiary)" }}>
                No results for "{query}"
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

              {favorites.length > 0 && (
                <div>
                  <p className="section-label" style={{ paddingLeft: 16, marginBottom: 8 }}>
                    Favorites
                  </p>
                  <div className="grouped-section">
                    {favorites.map((song) => (
                      <SongCard
                        key={song.id}
                        song={song}
                        onOpen={() => setViewSong(song)}
                        onToggleFavorite={() => handleToggleFavorite(song)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {nonFavorites.length > 0 && (
                <div>
                  {favorites.length > 0 && !query && (
                    <p className="section-label" style={{ paddingLeft: 16, marginBottom: 8 }}>
                      All Songs
                    </p>
                  )}
                  <div className="grouped-section">
                    {nonFavorites.map((song) => (
                      <SongCard
                        key={song.id}
                        song={song}
                        onOpen={() => setViewSong(song)}
                        onToggleFavorite={() => handleToggleFavorite(song)}
                      />
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {viewSong && (
        <SongModal
          song={viewSong}
          onClose={() => setViewSong(null)}
          onEdit={(s) => { setEditSong(s); setViewSong(null) }}
          onDeleted={handleDeleted}
          onDuplicate={handleDuplicate}
          onToggleFavorite={handleToggleFavorite}
        />
      )}
    </>
  )
}
