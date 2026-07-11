import { useState, useRef, useCallback } from "react"
import type { Song, SongPDF } from "@/types"
import { Upload, FileText, Trash2, X, ChevronLeft } from "lucide-react"

interface Props {
  song: Song
  isNew: boolean
  onSave: (song: Song) => void
  onCancel: () => void
}

const INPUT_STYLE: React.CSSProperties = {
  width:         "100%",
  height:        44,
  borderRadius:  10,
  background:    "rgba(120,120,128,0.10)",
  border:        "none",
  color:         "var(--foreground)",
  padding:       "0 14px",
  fontSize:      17,
  fontFamily:    "inherit",
  outline:       "none",
  letterSpacing: "-0.41px",
}

const FIELD_LABEL: React.CSSProperties = {
  fontSize:      12,
  fontWeight:    600,
  color:         "var(--text-tertiary)",
  letterSpacing: "0.6px",
  marginBottom:  6,
  paddingLeft:   2,
}

export function SongEditor({ song, isNew, onSave, onCancel }: Props) {
  const [title,       setTitle]       = useState(song.title)
  const [artist,      setArtist]      = useState(song.artist)
  const [album,       setAlbum]       = useState(song.album ?? "")
  const [key,         setKey]         = useState(song.key ?? "")
  const [capo,        setCapo]        = useState(String(song.capo ?? 0))
  const [content,     setContent]     = useState(song.content)
  const [pdf,         setPdf]         = useState<SongPDF | undefined>(song.pdf)
  const [uploading,   setUploading]   = useState(false)
  const [showDiscard, setShowDiscard] = useState(false)

  const fileInput = useRef<HTMLInputElement>(null)

  // ── Dirty check ─────────────────────────────────────────────────────
  const isDirty = isNew
    ? Boolean(title.trim() || artist.trim() || album.trim() || key.trim() ||
              parseInt(capo) > 0 || content.trim() || pdf)
    : (
        title   !== song.title              ||
        artist  !== song.artist             ||
        album   !== (song.album ?? "")      ||
        key     !== (song.key ?? "")        ||
        capo    !== String(song.capo ?? 0)  ||
        content !== song.content            ||
        pdf     !== song.pdf
      )

  const getCurrentSong = useCallback((): Song => ({
    ...song,
    title:      title.trim(),
    artist:     artist.trim(),
    album:      album.trim()   || undefined,
    key:        key.trim()     || undefined,
    capo:       parseInt(capo) || 0,
    content,
    pdf,
    modifiedAt: Date.now(),
  }), [song, title, artist, album, key, capo, content, pdf])

  // ── Actions ──────────────────────────────────────────────────────────
  const handleDone = () => onSave(getCurrentSong())

  const handleCancel = () => {
    if (isDirty) setShowDiscard(true)
    else         onCancel()
  }

  const handlePDFFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) return
    setUploading(true)
    try {
      const data = await file.arrayBuffer()
      setPdf({ data, filename: file.name, size: file.size, uploadedAt: Date.now(), lastViewedPage: 1, bookmarks: [] })
    } finally { setUploading(false) }
  }

  const canSave = title.trim().length > 0

  return (
    <>
      <div
        className="modal-slide-up"
        style={{
          position:      "fixed",
          inset:         0,
          zIndex:        50,
          display:       "flex",
          flexDirection: "column",
          background:    "var(--card)",     /* white in light mode */
          paddingTop:    "var(--safe-top)",
        }}
      >
        {/* ── Navigation bar ──────────────────────────────────────────── */}
        <div style={{
          display:      "flex",
          alignItems:   "center",
          padding:      "0 8px",
          height:       52,
          borderBottom: "0.5px solid var(--separator)",
          flexShrink:   0,
        }}>
          {/* Cancel — back chevron + label, 48px min tap area */}
          <button
            onClick={handleCancel}
            style={{
              display:        "flex",
              alignItems:     "center",
              gap:            2,
              background:     "none",
              border:         "none",
              color:          "var(--primary)",
              cursor:         "pointer",
              padding:        "0 10px",
              minWidth:       64,
              height:         48,
              fontSize:       17,
              letterSpacing:  "-0.3px",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <ChevronLeft size={20} strokeWidth={2} style={{ marginLeft: -4 }} />
            Cancel
          </button>

          {/* Title */}
          <p style={{
            flex:          1,
            textAlign:     "center",
            fontSize:      17,
            fontWeight:    600,
            letterSpacing: "-0.41px",
            overflow:      "hidden",
            textOverflow:  "ellipsis",
            whiteSpace:    "nowrap",
            color:         "var(--foreground)",
          }}>
            {title.trim() || (isNew ? "New Song" : song.title || "Edit Song")}
          </p>

          {/* Add / Done — wider hit area */}
          <div style={{ minWidth: 64, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={handleDone}
              disabled={!canSave}
              style={{
                background:    "none",
                border:        "none",
                fontSize:      17,
                fontWeight:    600,
                color:         canSave ? "var(--primary)" : "var(--text-tertiary)",
                cursor:        canSave ? "pointer" : "default",
                padding:       "0 10px",
                height:        48,
                transition:    "color 0.15s ease",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {isNew ? "Add" : "Done"}
            </button>
          </div>
        </div>

        {/* ── Form ────────────────────────────────────────────────────── */}
        <div
          className="scroll-content"
          style={{ flex: 1, overflowY: "auto", padding: "20px 16px calc(var(--safe-bottom) + 48px)" }}
        >

          {/* TITLE */}
          <div style={{ marginBottom: 16 }}>
            <p style={FIELD_LABEL}>TITLE</p>
            <input
              id="song-title"
              name="song-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Song title"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
              style={INPUT_STYLE}
            />
          </div>

          {/* ARTIST */}
          <div style={{ marginBottom: 16 }}>
            <p style={FIELD_LABEL}>ARTIST</p>
            <input
              id="song-artist"
              name="song-artist"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Artist name"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
              style={INPUT_STYLE}
            />
          </div>

          {/* ALBUM / KEY / CAPO row */}
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <p style={FIELD_LABEL}>ALBUM</p>
              <input
                id="song-album"
                name="song-album"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                placeholder="Optional"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="words"
                style={INPUT_STYLE}
              />
            </div>
            <div style={{ width: 72 }}>
              <p style={FIELD_LABEL}>KEY</p>
              <input
                id="song-key"
                name="song-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="C"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                style={{ ...INPUT_STYLE, width: 72 }}
              />
            </div>
            <div style={{ width: 72 }}>
              <p style={FIELD_LABEL}>CAPO</p>
              <input
                id="song-capo"
                name="song-capo"
                value={capo}
                onChange={(e) => setCapo(e.target.value)}
                type="number"
                min={0}
                max={12}
                inputMode="numeric"
                style={{ ...INPUT_STYLE, width: 72 }}
              />
            </div>
          </div>

          {/* PDF attachment */}
          <div style={{ marginBottom: 24 }}>
            <p style={FIELD_LABEL}>SHEET MUSIC (PDF)</p>
            {pdf ? (
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                background: "rgba(120,120,128,0.07)", borderRadius: 12, padding: "12px 14px",
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(0,122,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <FileText size={18} strokeWidth={1.5} style={{ color: "var(--primary)" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pdf.filename}</p>
                  <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{(pdf.size / 1_048_576).toFixed(1)} MB</p>
                </div>
                <button
                  onClick={() => setPdf(undefined)}
                  aria-label="Remove PDF"
                  style={{ background: "none", border: "none", padding: 10, cursor: "pointer", color: "var(--destructive)", display: "flex", alignItems: "center" }}
                >
                  <Trash2 size={17} strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInput.current?.click()}
                onDrop={async (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) await handlePDFFile(f) }}
                onDragOver={(e) => e.preventDefault()}
                disabled={uploading}
                style={{
                  width: "100%", display: "flex", flexDirection: "column", alignItems: "center",
                  gap: 6, padding: "28px 0", border: "1.5px dashed var(--separator)",
                  borderRadius: 12, background: "rgba(120,120,128,0.04)", cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {uploading
                  ? <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid var(--primary)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
                  : <Upload size={22} strokeWidth={1.5} style={{ color: "var(--text-tertiary)" }} />}
                <span style={{ fontSize: 15, color: "var(--text-tertiary)" }}>
                  {uploading ? "Importing…" : "Tap to attach a PDF"}
                </span>
              </button>
            )}
            <input ref={fileInput} type="file" accept=".pdf" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePDFFile(f) }} />
          </div>

          {/* Chords & Lyrics */}
          <div>
            <p style={FIELD_LABEL}>CHORDS & LYRICS</p>
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 10, lineHeight: "18px" }}>
              Use spaces to align chord names above their lyrics. Whitespace is preserved.
            </p>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={"C        G\nAmazing grace how sweet the sound\n\nAm       F\nThat saved a wretch like me"}
              className="chord-editor"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              style={{
                width: "100%", minHeight: 280, padding: 16, borderRadius: 12,
                background: "rgba(120,120,128,0.07)", border: "none", color: "var(--foreground)",
                outline: "none", resize: "vertical", display: "block", fontFamily: "inherit",
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Discard confirmation sheet ──────────────────────────────────── */}
      {showDiscard && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.30)" }}
            onClick={() => setShowDiscard(false)}
          />
          <div
            role="dialog"
            aria-modal
            aria-label="Discard changes?"
            style={{
              position:  "fixed",
              bottom:    0,
              left:      0,
              right:     0,
              zIndex:    101,
              padding:   "0 8px calc(env(safe-area-inset-bottom) + 8px)",
              animation: "sheetUp 0.22s ease",
            }}
          >
            <div style={{ background: "var(--card)", borderRadius: 14, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ padding: "16px 16px 12px", textAlign: "center", borderBottom: "1px solid var(--separator)" }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                  Discard {isNew ? "New Song" : "Changes"}?
                </p>
                <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 4 }}>
                  {isNew
                    ? "You have unsaved content. If you go back now, it will be lost."
                    : "Your edits haven't been saved. Going back will discard them."}
                </p>
              </div>
              <button
                onClick={onCancel}
                style={{
                  width: "100%", padding: "16px", background: "transparent", border: "none",
                  fontSize: 17, fontWeight: 600, color: "var(--destructive)", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                <X size={16} strokeWidth={2.5} />
                {isNew ? "Discard Song" : "Discard Changes"}
              </button>
            </div>
            <button
              onClick={() => setShowDiscard(false)}
              style={{
                width: "100%", padding: "16px", background: "var(--card)", border: "none",
                borderRadius: 14, fontSize: 17, fontWeight: 600, color: "var(--primary)", cursor: "pointer",
              }}
            >
              Keep Editing
            </button>
          </div>
        </>
      )}
    </>
  )
}
