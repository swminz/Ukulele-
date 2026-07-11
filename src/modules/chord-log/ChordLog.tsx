import { useState, useEffect, useRef } from "react"
import { getAllSongs, saveSong } from "@/lib/db"
import { haptic } from "@/lib/audio"
import type { Song, SongPDF, SongAudio } from "@/types"
import { SongCard } from "./SongCard"
import { SongModal } from "./SongModal"
import { SongEditor } from "./SongEditor"
import { AudioUploadCard, PDFUploadCard } from "./UploadCard"
import { Search, X } from "lucide-react"

function makeId() { return `song_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }

function newSong(): Song {
  const now = Date.now()
  return { id: makeId(), title: "", artist: "", content: "", createdAt: now, modifiedAt: now, favorite: false }
}

// ── Accepted file types ────────────────────────────────────────────────────────
const ACCEPT = ".pdf,.mp3,.m4a,.m4p,.aac,.wav,.ogg,.flac,.opus,.wma"
const AUDIO_TYPES = /\.(mp3|m4a|m4p|aac|wav|ogg|flac|opus|wma)$/i

function isAudio(filename: string) { return AUDIO_TYPES.test(filename) }
function isPDF(filename: string)   { return /\.pdf$/i.test(filename) }

// ── iOS-style search bar ──────────────────────────────────────────────────────
function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="ios-search-wrap">
      <div className="ios-search-field">
        <span className="ios-search-icon"><Search size={15} /></span>
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
  addTrigger?:    number
  uploadTrigger?: number
}

export function ChordLog({ addTrigger, uploadTrigger }: Props) {
  const [songs,      setSongs]    = useState<Song[]>([])
  const [query,      setQuery]    = useState("")
  const [viewSong,   setViewSong] = useState<Song | null>(null)
  const [editSong,   setEditSong] = useState<Song | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [uploading,  setUploading]  = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = async () => setSongs(await getAllSongs())
  useEffect(() => { void load() }, [])

  // ── Add-song trigger ──────────────────────────────────────────────────
  const prevAddTrigger = useRef(addTrigger ?? 0)
  useEffect(() => {
    if (addTrigger === undefined) return
    if (addTrigger === prevAddTrigger.current) return
    prevAddTrigger.current = addTrigger
    handleCreate()
  }, [addTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Upload trigger ────────────────────────────────────────────────────
  const prevUploadTrigger = useRef(uploadTrigger ?? 0)
  useEffect(() => {
    if (uploadTrigger === undefined) return
    if (uploadTrigger === prevUploadTrigger.current) return
    prevUploadTrigger.current = uploadTrigger
    fileInputRef.current?.click()
  }, [uploadTrigger])

  // ── File selected from picker ─────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    e.target.value = ""  // reset so same file can be re-picked

    setUploading(true)
    try {
      for (const file of files) {
        const data = await file.arrayBuffer()
        const now  = Date.now()
        const title = file.name.replace(/\.[^.]+$/, "")   // strip extension

        let song: Song

        if (isPDF(file.name)) {
          const pdf: SongPDF = {
            data,
            filename:      file.name,
            size:          file.size,
            uploadedAt:    now,
            lastViewedPage:1,
            bookmarks:     [],
          }
          song = {
            id:         makeId(),
            title,
            artist:     "",
            content:    "",
            createdAt:  now,
            modifiedAt: now,
            favorite:   false,
            isUploaded: true,
            pdf,
          }
        } else if (isAudio(file.name)) {
          const audio: SongAudio = {
            data,
            filename:   file.name,
            size:       file.size,
            mimeType:   file.type || "audio/mpeg",
            uploadedAt: now,
          }
          song = {
            id:         makeId(),
            title,
            artist:     "",
            content:    "",
            createdAt:  now,
            modifiedAt: now,
            favorite:   false,
            isUploaded: true,
            audio,
          }
        } else {
          continue   // unsupported type — skip silently
        }

        await saveSong(song)
      }
    } finally {
      setUploading(false)
      await load()
    }
  }

  // ── Derived lists ─────────────────────────────────────────────────────
  const filtered = songs.filter((s) => {
    const q = query.toLowerCase()
    return (
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q) ||
      (s.album ?? "").toLowerCase().includes(q)
    )
  })

  // Uploads (audio or PDF with isUploaded flag) shown at the top
  const uploads      = filtered.filter((s) => s.isUploaded)
  const nonUploads   = filtered.filter((s) => !s.isUploaded)
  const favorites    = nonUploads.filter((s) =>  s.favorite)
  const nonFavorites = nonUploads.filter((s) => !s.favorite)

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleCreate = () => {
    haptic(10)
    setEditSong(newSong())
    setIsCreating(true)
  }

  const handleSave = async (song: Song) => {
    await saveSong(song)
    await load()
    setIsCreating(false)
    setEditSong(null)
    // Always return to the songs list after saving — no auto-open modal
  }

  const handleCancel = () => {
    setEditSong(null)
    setIsCreating(false)
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

  // ── Render ────────────────────────────────────────────────────────────
  if (editSong) {
    return (
      <SongEditor
        song={editSong}
        isNew={isCreating}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    )
  }

  const totalNonUpload = favorites.length + nonFavorites.length
  const isEmpty = songs.length === 0 && !uploading

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        style={{ display: "none" }}
        onChange={handleFileChange}
        aria-hidden
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--background)" }}>
        {/* Search */}
        <div style={{ padding: "10px 16px 12px", flexShrink: 0 }}>
          <SearchBar value={query} onChange={setQuery} />
        </div>

        {/* List */}
        <div
          className="scroll-content"
          style={{ flex: 1, overflowY: "auto", padding: "0 16px calc(var(--safe-bottom) + 32px)" }}
        >
          {/* Upload in-progress banner */}
          {uploading && (
            <div style={{
              background: "rgba(0,122,255,0.07)", borderRadius: 12,
              padding: "12px 16px", marginBottom: 16, textAlign: "center",
              fontSize: 14, color: "var(--primary)", fontWeight: 500,
            }}>
              Importing…
            </div>
          )}

          {isEmpty ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", height: 280, textAlign: "center", gap: 10,
            }}>
              <p style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)" }}>No songs yet</p>
              <p style={{ fontSize: 15, color: "var(--text-tertiary)", maxWidth: 240, lineHeight: "20px" }}>
                Tap + to add your first song or upload a music file.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", paddingTop: 64 }}>
              <p style={{ fontSize: 17, color: "var(--text-tertiary)" }}>No results for "{query}"</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

              {/* ── Uploads section ── */}
              {uploads.length > 0 && (
                <div>
                  <p className="section-label" style={{ paddingLeft: 16, marginBottom: 8 }}>Uploads</p>
                  <div className="grouped-section">
                    {uploads.map((song) =>
                      song.audio ? (
                        <AudioUploadCard
                          key={song.id}
                          song={song}
                          onOpen={() => setViewSong(song)}
                          onToggleFavorite={() => handleToggleFavorite(song)}
                        />
                      ) : (
                        <PDFUploadCard
                          key={song.id}
                          song={song}
                          onOpen={() => setViewSong(song)}
                          onToggleFavorite={() => handleToggleFavorite(song)}
                        />
                      )
                    )}
                  </div>
                </div>
              )}

              {/* ── Favorites ── */}
              {favorites.length > 0 && (
                <div>
                  <p className="section-label" style={{ paddingLeft: 16, marginBottom: 8 }}>Favorites</p>
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

              {/* ── All songs ── */}
              {nonFavorites.length > 0 && (
                <div>
                  {(favorites.length > 0 || uploads.length > 0) && !query && (
                    <p className="section-label" style={{ paddingLeft: 16, marginBottom: 8 }}>All Songs</p>
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

              {/* When no non-upload content but uploads exist and empty song count otherwise */}
              {totalNonUpload === 0 && uploads.length > 0 && !query && null}
            </div>
          )}
        </div>
      </div>

      {viewSong && (
        <SongModal
          song={viewSong}
          onClose={() => setViewSong(null)}
          onEdit={(s) => { setEditSong(s); setIsCreating(false); setViewSong(null) }}
          onDeleted={handleDeleted}
          onDuplicate={handleDuplicate}
          onToggleFavorite={handleToggleFavorite}
        />
      )}
    </>
  )
}
