import { useState, useRef, useCallback } from "react"
import type { Song, SongPDF } from "@/types"
import { Upload, FileText, Trash2, X } from "lucide-react"

interface Props {
  song: Song
  isNew: boolean          // true = draft that has never been saved
  onSave: (song: Song) => void
  onCancel: () => void
}

const INPUT_STYLE: React.CSSProperties = {
  width:        "100%",
  height:       44,
  borderRadius: 10,
  background:   "rgba(120,120,128,0.08)",
  border:       "none",
  color:        "var(--foreground)",
  padding:      "0 14px",
  fontSize:     17,
  fontFamily:   "inherit",
  outline:      "none",
  letterSpacing:"-0.41px",
}

export function SongEditor({ song, isNew, onSave, onCancel }: Props) {
  const [title,    setTitle]    = useState(song.title)
  const [artist,   setArtist]   = useState(song.artist)
  const [album,    setAlbum]    = useState(song.album ?? "")
  const [key,      setKey]      = useState(song.key ?? "")
  const [capo,     setCapo]     = useState(String(song.capo ?? 0))
  const [notes,    setNotes]    = useState(song.notes ?? "")
  const [content,  setContent]  = useState(song.content)
  const [pdf,      setPdf]      = useState<SongPDF | undefined>(song.pdf)
  const [uploading, setUploading] = useState(false)
  const [showDiscard, setShowDiscard] = useState(false)

  const fileInput = useRef<HTMLInputElement>(null)

  // ── Dirty check ──────────────────────────────────────────────────────────
  // For new songs: any non-empty field = dirty.
  // For existing songs: any change from original = dirty.
  const isDirty = isNew
    ? Boolean(title.trim() || artist.trim() || album.trim() || key.trim() ||
              parseInt(capo) > 0 || notes.trim() || content.trim() || pdf)
    : (
        title   !== song.title   ||
        artist  !== song.artist  ||
        album   !== (song.album ?? "") ||
        key     !== (song.key ?? "")   ||
        capo    !== String(song.capo ?? 0) ||
        notes   !== (song.notes ?? "") ||
        content !== song.content ||
        pdf     !== song.pdf
      )

  const getCurrentSong = useCallback((): Song => ({
    ...song,
    title:      title.trim(),
    artist:     artist.trim(),
    album:      album.trim()  || undefined,
    key:        key.trim()    || undefined,
    capo:       parseInt(capo) || 0,
    notes:      notes.trim()  || undefined,
    content,
    pdf,
    modifiedAt: Date.now(),
  }), [song, title, artist, album, key, capo, notes, content, pdf])

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleDone = () => {
    onSave(getCurrentSong())
  }

  const handleCancel = () => {
    if (isDirty) {
      setShowDiscard(true)   // show confirmation
    } else {
      onCancel()
    }
  }

  const handlePDFFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) return
    setUploading(true)
    try {
      const data = await file.arrayBuffer()
      setPdf({ data, filename: file.name, size: file.size, uploadedAt: Date.now(), lastViewedPage: 1, bookmarks: [] })
    } finally { setUploading(false) }
  }

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 6, paddingLeft: 4, letterSpacing: "0.1px" }}>
        {label}
      </p>
      {children}
    </div>
  )

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
          background:    "var(--background)",
          paddingTop:    "env(safe-area-inset-top)",
        }}
      >
        {/* ── Navigation bar ── */}
        <div
          style={{
            display:       "flex",
            alignItems:    "center",
            padding:       "10px 16px",
            borderBottom:  "1px solid var(--separator)",
            flexShrink:    0,
          }}
        >
          <button
            onClick={handleCancel}
            style={{ background: "none", border: "none", fontSize: 17, color: "var(--primary)", cursor: "pointer", padding: "8px 0", minWidth: 60 }}
          >
            Cancel
          </button>
          <p
            style={{
              flex:          1,
              textAlign:     "center",
              fontSize:      17,
              fontWeight:    600,
              letterSpacing: "-0.41px",
              overflow:      "hidden",
              textOverflow:  "ellipsis",
              whiteSpace:    "nowrap",
              color:         "var(--foreground)",
            }}
          >
            {title.trim() || (isNew ? "New Song" : song.title || "Edit Song")}
          </p>
          <div style={{ minWidth: 60, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={handleDone}
              disabled={isNew && !title.trim()}
              style={{
                background:  "none",
                border:      "none",
                fontSize:    17,
                fontWeight:  600,
                color:       isNew && !title.trim() ? "var(--text-tertiary)" : "var(--primary)",
                cursor:      isNew && !title.trim() ? "default" : "pointer",
                padding:     "8px 0",
                transition:  "color 0.15s ease",
              }}
            >
              {isNew ? "Add" : "Done"}
            </button>
          </div>
        </div>

        {/* ── Form ── */}
        <div className="scroll-content" style={{ flex: 1, overflowY: "auto", padding: "24px 16px 48px" }}>

          <Field label="TITLE">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Song title"
              style={INPUT_STYLE}
              autoFocus
            />
          </Field>

          <Field label="ARTIST">
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Artist name"
              style={INPUT_STYLE}
            />
          </Field>

          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 6, paddingLeft: 4 }}>ALBUM</p>
              <input value={album} onChange={(e) => setAlbum(e.target.value)} placeholder="Optional" style={INPUT_STYLE} />
            </div>
            <div style={{ width: 72 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 6, paddingLeft: 4 }}>KEY</p>
              <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="C" style={{ ...INPUT_STYLE, width: 72 }} />
            </div>
            <div style={{ width: 72 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 6, paddingLeft: 4 }}>CAPO</p>
              <input value={capo} onChange={(e) => setCapo(e.target.value)} type="number" min={0} max={12} style={{ ...INPUT_STYLE, width: 72 }} />
            </div>
          </div>

          <Field label="NOTES">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tempo, tuning, special instructions…"
              rows={2}
              style={{ ...INPUT_STYLE, height: "auto", padding: "12px 14px", resize: "none", fontFamily: "inherit", lineHeight: "1.5" }}
            />
          </Field>

          {/* PDF attachment */}
          <div style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 8, paddingLeft: 4 }}>SHEET MUSIC (PDF)</p>
            {pdf ? (
              <div className="grouped-section">
                <div className="grouped-row" style={{ gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(0,122,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <FileText size={18} strokeWidth={1.5} style={{ color: "var(--primary)" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pdf.filename}</p>
                    <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{(pdf.size / 1_048_576).toFixed(1)} MB</p>
                  </div>
                  <button
                    onClick={() => setPdf(undefined)}
                    aria-label="Remove PDF"
                    style={{ background: "none", border: "none", padding: 8, cursor: "pointer", color: "var(--destructive)", display: "flex", alignItems: "center" }}
                  >
                    <Trash2 size={17} strokeWidth={1.5} />
                  </button>
                </div>
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
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePDFFile(f) }} />
          </div>

          {/* Chords & Lyrics */}
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 6, paddingLeft: 4 }}>CHORDS & LYRICS</p>
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 10, paddingLeft: 4, lineHeight: "18px" }}>
              Use spaces to align chord names above their lyrics. Whitespace is preserved.
            </p>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={"C        G\nAmazing grace how sweet the sound\n\nAm       F\nThat saved a wretch like me"}
              className="chord-editor"
              style={{ width: "100%", minHeight: 280, padding: 16, borderRadius: 12, background: "rgba(120,120,128,0.06)", border: "none", color: "var(--foreground)", outline: "none", resize: "vertical", display: "block" }}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
        </div>
      </div>

      {/* ── Discard confirmation sheet ────────────────────────────────────────
          Shown when Cancel is pressed and there are unsaved changes.
          iOS-style action sheet from the bottom.
          ─────────────────────────────────────────────────────────────────── */}
      {showDiscard && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position:   "fixed",
              inset:      0,
              zIndex:     100,
              background: "rgba(0,0,0,0.3)",
            }}
            onClick={() => setShowDiscard(false)}
          />

          {/* Action sheet */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Discard changes?"
            style={{
              position:      "fixed",
              bottom:        0,
              left:          0,
              right:         0,
              zIndex:        101,
              padding:       "0 8px calc(env(safe-area-inset-bottom) + 8px)",
              animation:     "sheetUp 0.22s ease",
            }}
          >
            {/* Main group */}
            <div
              style={{
                background:   "var(--card)",
                borderRadius: 14,
                overflow:     "hidden",
                marginBottom: 8,
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding:       "16px 16px 12px",
                  textAlign:     "center",
                  borderBottom:  "1px solid var(--separator)",
                }}
              >
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                  Discard {isNew ? "New Song" : "Changes"}?
                </p>
                <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 4 }}>
                  {isNew
                    ? "You have unsaved content. If you go back now, it will be lost."
                    : "Your edits haven't been saved. Going back will discard them."}
                </p>
              </div>

              {/* Discard */}
              <button
                onClick={onCancel}
                style={{
                  width:      "100%",
                  padding:    "16px",
                  background: "transparent",
                  border:     "none",
                  fontSize:   17,
                  fontWeight: 600,
                  color:      "var(--destructive)",
                  cursor:     "pointer",
                  display:    "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap:        8,
                }}
              >
                <X size={16} strokeWidth={2.5} />
                {isNew ? "Discard Song" : "Discard Changes"}
              </button>
            </div>

            {/* Keep Editing — separate pill */}
            <button
              onClick={() => setShowDiscard(false)}
              style={{
                width:         "100%",
                padding:       "16px",
                background:    "var(--card)",
                border:        "none",
                borderRadius:  14,
                fontSize:      17,
                fontWeight:    600,
                color:         "var(--primary)",
                cursor:        "pointer",
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
