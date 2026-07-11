import { useState, useEffect, useRef } from "react"
import { getAllSongs, saveSong, deleteSong } from "@/lib/db"
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

// Pending duplicate info (kept in state while the action sheet is shown)
interface DuplicatePending {
  file:         File
  data:         ArrayBuffer
  existingSong: Song
}

type SongsTab = "music" | "songs"

export function ChordLog({ addTrigger, uploadTrigger }: Props) {
  const [songs,            setSongs]           = useState<Song[]>([])
  const [query,            setQuery]           = useState("")
  const [tab,              setTab]             = useState<SongsTab>("music")
  const [viewSong,         setViewSong]        = useState<Song | null>(null)
  const [editSong,         setEditSong]        = useState<Song | null>(null)
  const [isCreating,       setIsCreating]      = useState(false)
  const [uploading,        setUploading]       = useState(false)
  const [duplicatePending, setDuplicatePending] = useState<DuplicatePending | null>(null)

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

  // ── Build a Song object from a File + its ArrayBuffer ────────────────
  function buildSong(file: File, data: ArrayBuffer): Song | null {
    const now   = Date.now()
    const title = file.name.replace(/\.[^.]+$/, "")
    if (isPDF(file.name)) {
      const pdf: SongPDF = {
        data, filename: file.name, size: file.size,
        uploadedAt: now, lastViewedPage: 1, bookmarks: [],
      }
      return { id: makeId(), title, artist: "", content: "", createdAt: now, modifiedAt: now, favorite: false, isUploaded: true, pdf }
    }
    if (isAudio(file.name)) {
      const audio: SongAudio = {
        data, filename: file.name, size: file.size,
        mimeType: file.type || "audio/mpeg", uploadedAt: now,
      }
      return { id: makeId(), title, artist: "", content: "", createdAt: now, modifiedAt: now, favorite: false, isUploaded: true, audio }
    }
    return null   // unsupported type
  }

  // ── File selected from picker ─────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    e.target.value = ""

    setUploading(true)
    try {
      for (const file of files) {
        // Check for an existing upload with the same filename
        const existing = songs.find((s) =>
          s.isUploaded && (
            s.pdf?.filename   === file.name ||
            s.audio?.filename === file.name
          )
        )
        const data = await file.arrayBuffer()

        if (existing) {
          // Pause and ask the user what to do
          setDuplicatePending({ file, data, existingSong: existing })
          return  // remaining files deferred until dialog resolves
        }

        const song = buildSong(file, data)
        if (song) await saveSong(song)
      }
    } finally {
      setUploading(false)
      await load()
    }
  }

  // ── Duplicate dialog handlers ─────────────────────────────────────────
  const handleReplaceExisting = async () => {
    if (!duplicatePending) return
    const { file, data, existingSong } = duplicatePending
    setDuplicatePending(null)
    await deleteSong(existingSong.id)
    const song = buildSong(file, data)
    if (song) await saveSong(song)
    await load()
  }

  const handleKeepBoth = async () => {
    if (!duplicatePending) return
    const { file, data } = duplicatePending
    setDuplicatePending(null)
    const song = buildSong(file, data)
    if (song) await saveSong(song)
    await load()
  }

  const handleCancelDuplicate = () => setDuplicatePending(null)

  // ── Derived lists ─────────────────────────────────────────────────────
  const filtered = songs.filter((s) => {
    const q = query.toLowerCase()
    return (
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q) ||
      (s.album ?? "").toLowerCase().includes(q)
    )
  })

  // Music Notes tab: PDF uploads only
  const sheetUploads = filtered.filter((s) => s.isUploaded && s.pdf)
  // Songs tab: regular (non-uploaded) songs + audio uploads
  const songsList    = filtered.filter((s) => !s.isUploaded || s.audio)
  const favorites    = songsList.filter((s) => !s.isUploaded && s.favorite)
  const nonFavorites = songsList.filter((s) => !s.isUploaded && !s.favorite)
  const audioUploads = songsList.filter((s) =>  s.isUploaded && s.audio)

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

  const handleDelete = async (song: Song) => {
    haptic([10, 30, 10])
    await deleteSong(song.id)
    await load()
    if (viewSong?.id === song.id) setViewSong(null)
  }

  const handleToggleFavorite = async (song: Song) => {
    const updated = { ...song, favorite: !song.favorite, modifiedAt: Date.now() }
    await saveSong(updated)
    setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
    if (viewSong?.id === updated.id) setViewSong(updated)
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
        <div style={{ padding: "10px 16px 0", flexShrink: 0 }}>
          <SearchBar value={query} onChange={setQuery} />
        </div>

        {/* ── Tab bar (underline style, matching Practice) ── */}
        <div style={{ display: "flex", flexShrink: 0, borderBottom: "1px solid var(--separator)", marginTop: 6 }}>
          {([["music", "Music Notes"], ["songs", "Songs"]] as [SongsTab, string][]).map(([id, label]) => {
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
                  fontSize:      15,
                  fontWeight:    active ? 600 : 400,
                  letterSpacing: "-0.24px",
                  cursor:        "pointer",
                  transition:    "color 0.15s ease, border-color 0.15s ease",
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* ── Tab content ── */}
        <div
          className="scroll-content"
          style={{ flex: 1, overflowY: "auto", padding: "0 16px calc(var(--safe-bottom) + 32px)" }}
        >
          {/* Upload in-progress banner */}
          {uploading && (
            <div style={{
              background: "rgba(0,122,255,0.07)", borderRadius: 12,
              padding: "12px 16px", margin: "12px 0", textAlign: "center",
              fontSize: 14, color: "var(--primary)", fontWeight: 500,
            }}>
              Importing…
            </div>
          )}

          {/* ════ MUSIC NOTES tab ════ */}
          {tab === "music" && (
            <>
              {sheetUploads.length === 0 ? (
                query ? (
                  <div style={{ textAlign: "center", paddingTop: 64 }}>
                    <p style={{ fontSize: 17, color: "var(--text-tertiary)" }}>No results for "{query}"</p>
                  </div>
                ) : (
                  <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", height: 260, textAlign: "center", gap: 10,
                  }}>
                    <p style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)" }}>No sheets yet</p>
                    <p style={{ fontSize: 15, color: "var(--text-tertiary)", maxWidth: 240, lineHeight: "20px" }}>
                      Tap + then "Upload Music" to import a PDF sheet.
                    </p>
                  </div>
                )
              ) : (
                <div style={{ paddingTop: 20 }}>
                  <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--foreground)", marginBottom: 16, paddingLeft: 2 }}>
                    Fingerstyle Music Sheets
                  </p>
                  <div className="grouped-section">
                    {sheetUploads.map((song) => (
                      <PDFUploadCard
                        key={song.id}
                        song={song}
                        onOpen={() => setViewSong(song)}
                        onToggleFavorite={() => handleToggleFavorite(song)}
                        onDelete={() => handleDelete(song)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ════ SONGS tab ════ */}
          {tab === "songs" && (
            <>
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
              ) : filtered.filter((s) => !s.isUploaded || s.audio).length === 0 ? (
                <div style={{ textAlign: "center", paddingTop: 64 }}>
                  <p style={{ fontSize: 17, color: "var(--text-tertiary)" }}>No results for "{query}"</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 20 }}>

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
                            onDelete={() => handleDelete(song)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── All Songs ── */}
                  {nonFavorites.length > 0 && (
                    <div>
                      <p className="section-label" style={{ paddingLeft: 16, marginBottom: 8 }}>All Songs</p>
                      <div className="grouped-section">
                        {nonFavorites.map((song) => (
                          <SongCard
                            key={song.id}
                            song={song}
                            onOpen={() => setViewSong(song)}
                            onToggleFavorite={() => handleToggleFavorite(song)}
                            onDelete={() => handleDelete(song)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Audio uploads ── */}
                  {audioUploads.length > 0 && (
                    <div>
                      <p className="section-label" style={{ paddingLeft: 16, marginBottom: 8 }}>Audio</p>
                      <div className="grouped-section">
                        {audioUploads.map((song) => (
                          <AudioUploadCard
                            key={song.id}
                            song={song}
                            onOpen={() => setViewSong(song)}
                            onToggleFavorite={() => handleToggleFavorite(song)}
                            onDelete={() => handleDelete(song)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {viewSong && (
        <SongModal
          song={viewSong}
          onClose={() => setViewSong(null)}
          onEdit={(s) => { setEditSong(s); setIsCreating(false); setViewSong(null) }}
          onDeleted={handleDeleted}
          onToggleFavorite={handleToggleFavorite}
        />
      )}

      {/* ── Duplicate file action sheet ─────────────────────────────────── */}
      {duplicatePending && (
        <>
          {/* Scrim */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.32)" }}
            onClick={handleCancelDuplicate}
          />

          {/* iOS-style action sheet */}
          <div
            role="alertdialog"
            aria-modal
            aria-label="File already exists"
            style={{
              position:  "fixed",
              bottom:    0,
              left:      0,
              right:     0,
              zIndex:    301,
              padding:   "0 10px calc(env(safe-area-inset-bottom) + 10px)",
              animation: "sheetUp 0.22s cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            {/* Main group */}
            <div style={{ background: "var(--card)", borderRadius: 14, overflow: "hidden", marginBottom: 10 }}>

              {/* Header */}
              <div style={{ padding: "16px 16px 14px", textAlign: "center", borderBottom: "0.5px solid var(--separator)" }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)", marginBottom: 4 }}>
                  File Already Exists
                </p>
                <p style={{ fontSize: 13, color: "var(--text-tertiary)", lineHeight: "18px" }}>
                  "{duplicatePending.file.name}" has already been uploaded.
                  What would you like to do?
                </p>
              </div>

              {/* Replace Existing — primary */}
              <button
                onClick={handleReplaceExisting}
                style={{
                  width: "100%", padding: "15px 16px", background: "transparent",
                  border: "none", borderBottom: "0.5px solid var(--separator)",
                  fontSize: 17, fontWeight: 600, color: "var(--primary)",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Replace Existing
              </button>

              {/* Keep Both */}
              <button
                onClick={handleKeepBoth}
                style={{
                  width: "100%", padding: "15px 16px", background: "transparent",
                  border: "none",
                  fontSize: 17, fontWeight: 400, color: "var(--foreground)",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Keep Both
              </button>
            </div>

            {/* Cancel — separate pill */}
            <button
              onClick={handleCancelDuplicate}
              style={{
                width: "100%", padding: "15px 16px", background: "var(--card)",
                border: "none", borderRadius: 14,
                fontSize: 17, fontWeight: 600, color: "var(--primary)",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </>
  )
}
