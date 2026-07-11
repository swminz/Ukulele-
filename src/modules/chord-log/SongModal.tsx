import { useState, useEffect, useRef, useCallback } from "react"
import type { Song, SongPDF } from "@/types"
import { deleteSong, saveSong } from "@/lib/db"
import { extractPDFText } from "@/lib/pdf-text"
import { Edit3, Trash2, Heart, Share2, Play, Pause, FileText, Music2, ChevronLeft } from "lucide-react"
import { haptic } from "@/lib/audio"
import { useSettings } from "@/hooks/use-settings"
import { PDFViewer } from "@/modules/pdf-songbook/PDFViewer"

type Segment = "chords" | "sheet" | "info"

interface Props {
  song: Song
  onClose: () => void
  onEdit: (song: Song) => void
  onDeleted: () => void
  onToggleFavorite: (song: Song) => void
}

export function SongModal({ song: initialSong, onClose, onEdit, onDeleted, onToggleFavorite }: Props) {
  const [song,             setSong]             = useState(initialSong)
  const [segment,          setSegment]          = useState<Segment>("chords")
  const [pdfOpen,          setPdfOpen]          = useState(false)
  const [parsingSheetText, setParsingSheetText] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [shareToast,       setShareToast]       = useState(false)
  const [fontSize,         setFontSize]         = useState(() => Number(localStorage.getItem("uke_song_fontsize") ?? 14))
  const [isScrolling,      setIsScrolling]      = useState(false)
  const contentRef  = useRef<HTMLDivElement>(null)
  const scrollRaf   = useRef<number | null>(null)
  const { settings } = useSettings()

  const hasChords   = Boolean(song.content?.trim())
  const hasPDF      = Boolean(song.pdf)
  // PDF-only: song has no typed chords, only a PDF attachment
  const pdfOnly     = hasPDF && !hasChords

  useEffect(() => {
    if (pdfOnly) setSegment("sheet")
    else if (!hasChords && hasPDF) setSegment("sheet")
  }, [hasChords, hasPDF, pdfOnly])

  // When it's a PDF-only song, skip the Chords tab entirely
  const segments: { id: Segment; label: string }[] = pdfOnly
    ? [
        { id: "sheet", label: "Sheet" },
        { id: "info",  label: "Info"  },
      ]
    : [
        { id: "chords", label: "Chords" },
        ...(hasPDF ? [{ id: "sheet" as Segment, label: "Sheet" }] : []),
        { id: "info",   label: "Info" },
      ]

  const startScroll = useCallback(() => {
    if (scrollRaf.current) return
    const speed = settings.autoScrollSpeed / 60
    const tick = () => {
      if (!contentRef.current) return
      contentRef.current.scrollTop += speed
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current
      if (scrollTop + clientHeight >= scrollHeight - 4) { setIsScrolling(false); scrollRaf.current = null; return }
      scrollRaf.current = requestAnimationFrame(tick)
    }
    scrollRaf.current = requestAnimationFrame(tick)
  }, [settings.autoScrollSpeed])

  const stopScroll = useCallback(() => {
    if (scrollRaf.current) { cancelAnimationFrame(scrollRaf.current); scrollRaf.current = null }
  }, [])

  useEffect(() => { if (isScrolling) startScroll(); else stopScroll(); return stopScroll }, [isScrolling, startScroll, stopScroll])

  const handleFontSize = (s: number) => { setFontSize(s); localStorage.setItem("uke_song_fontsize", String(s)) }

  const handleShare = async () => {
    const parts = [song.title, song.artist, song.notes ? `Notes: ${song.notes}` : "", "", song.content].filter(Boolean)
    try { await navigator.clipboard.writeText(parts.join("\n")); setShareToast(true); setTimeout(() => setShareToast(false), 2000) } catch {}
  }

  const handleDelete = async () => {
    if (!showDeleteConfirm) { setShowDeleteConfirm(true); return }
    haptic([10, 50, 10])
    await deleteSong(song.id)
    onDeleted()
  }

  const handleFavorite = () => {
    const updated = { ...song, favorite: !song.favorite }
    setSong(updated)
    onToggleFavorite(updated)
  }

  const handlePDFMetaChange = (patch: Partial<SongPDF>) => {
    if (!song.pdf) return
    setSong((s) => ({ ...s, pdf: s.pdf ? { ...s.pdf, ...patch } : s.pdf }))
  }

  // Backfill parser for older uploads that don't yet have parsedText.
  // This keeps existing PDFs working without requiring re-upload.
  useEffect(() => {
    if (!song.pdf) return
    if (song.pdf.parsedText?.trim()) return
    let cancelled = false

    const run = async () => {
      setParsingSheetText(true)
      try {
        const parsedText = await extractPDFText(song.pdf!.data)
        if (cancelled || !parsedText.trim()) return
        const updated: Song = {
          ...song,
          pdf: { ...song.pdf!, parsedText },
          modifiedAt: Date.now(),
        }
        setSong(updated)
        await saveSong(updated)
      } catch {
        // Keep existing fallback UI; don't disrupt normal viewing.
      } finally {
        if (!cancelled) setParsingSheetText(false)
      }
    }

    void run()
    return () => { cancelled = true }
  }, [song])

  const renderChordAwareLine = (line: string, i: number) => {
    const parts = line.split(/(\[[^\]]+\])/g)
    return (
      <p
        key={`line-${i}`}
        style={{
          margin: 0,
          fontSize: 16,
          lineHeight: 1.6,
          fontWeight: 400,
          color: "var(--foreground)",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {parts.map((part, idx) => {
          const isChord = /^\[[^\]]+\]$/.test(part)
          return (
            <span
              key={`seg-${i}-${idx}`}
              style={{
                fontWeight: isChord ? 700 : 400,
                color: isChord ? "var(--foreground)" : "var(--foreground)",
              }}
            >
              {part}
            </span>
          )
        })}
      </p>
    )
  }

  return (
    <div
      className="modal-slide-up"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        background: "var(--background)",
        paddingTop: "var(--safe-top)",
      }}
    >
      {/* ── Navigation bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 8px 12px 16px",
          borderBottom: "1px solid var(--separator)",
          flexShrink: 0,
          gap: 4,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Back"
          style={{
            background:  "none",
            border:      "none",
            color:       "var(--primary)",
            cursor:      "pointer",
            padding:     "0 8px",
            height:      44,
            display:     "flex",
            alignItems:  "center",
            gap:         2,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <ChevronLeft size={22} strokeWidth={2} />
        </button>

        <div style={{ flex: 1, textAlign: "center", minWidth: 0, padding: "0 4px" }}>
          <p style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.41px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {song.title || "Untitled"}
          </p>
          {song.artist && (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {song.artist}
            </p>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <button onClick={handleFavorite} aria-label="Toggle favorite" style={{ background: "none", border: "none", padding: 10, cursor: "pointer", display: "flex", alignItems: "center" }}>
            <Heart size={20} strokeWidth={1.5} fill={song.favorite ? "var(--primary)" : "none"} style={{ color: song.favorite ? "var(--primary)" : "var(--text-tertiary)", transition: "0.15s" }} />
          </button>
          <button onClick={handleShare} aria-label="Share" style={{ background: "none", border: "none", padding: 10, cursor: "pointer", display: "flex", alignItems: "center" }}>
            <Share2 size={20} strokeWidth={1.5} style={{ color: shareToast ? "var(--success)" : "var(--text-tertiary)" }} />
          </button>
          <button onClick={() => onEdit(song)} aria-label="Edit" style={{ background: "none", border: "none", padding: 10, cursor: "pointer", display: "flex", alignItems: "center" }}>
            <Edit3 size={18} strokeWidth={1.5} style={{ color: "var(--primary)" }} />
          </button>
        </div>
      </div>

      {/* ── Underline tab bar (matches Practice tab style) ── */}
      {segments.length > 1 && (
        <div style={{ display: "flex", flexShrink: 0, borderBottom: "1px solid var(--separator)" }}>
          {segments.map((seg) => {
            const active = segment === seg.id
            return (
              <button
                key={seg.id}
                onClick={() => setSegment(seg.id)}
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
                {seg.label}
              </button>
            )
          })}
        </div>
      )}

      {/* ══ Chords & Lyrics ══ */}
      {segment === "chords" && (
        <>
          {/* Toolbar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 16px",
              borderBottom: "1px solid var(--separator)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => handleFontSize(Math.max(10, fontSize - 2))}
                style={{ background: "rgba(120,120,128,0.12)", border: "none", borderRadius: 6, width: 30, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "var(--foreground)" }}
              >
                A
              </button>
              <span style={{ fontSize: 13, color: "var(--text-tertiary)", width: 24, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{fontSize}</span>
              <button
                onClick={() => handleFontSize(Math.min(26, fontSize + 2))}
                style={{ background: "rgba(120,120,128,0.12)", border: "none", borderRadius: 6, width: 30, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16, fontWeight: 700, color: "var(--foreground)" }}
              >
                A
              </button>
            </div>

            <button
              onClick={() => setIsScrolling((v) => !v)}
              aria-label={isScrolling ? "Stop auto-scroll" : "Start auto-scroll"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                background: isScrolling ? "rgba(0,122,255,0.1)" : "rgba(120,120,128,0.12)",
                color: isScrolling ? "var(--primary)" : "var(--text-tertiary)",
                transition: "all 0.15s",
              }}
            >
              {isScrolling ? <Pause size={12} /> : <Play size={12} />}
              Auto-scroll
            </button>
          </div>

          <div ref={contentRef} className="scroll-content" style={{ flex: 1, overflowY: "auto", padding: "20px 20px calc(var(--safe-bottom) + 32px)" }}>
            {hasChords ? (
              <pre className="chord-editor" style={{ fontSize: `${fontSize}px`, color: "var(--foreground)" }}>
                {song.content}
              </pre>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, textAlign: "center", gap: 8 }}>
                <Music2 size={36} strokeWidth={1} style={{ color: "var(--text-tertiary)", marginBottom: 4 }} />
                <p style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)" }}>No chords yet</p>
                <p style={{ fontSize: 15, color: "var(--text-tertiary)" }}>Tap edit to add chords and lyrics.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ Sheet Music ══ */}
      {segment === "sheet" && (
        <div
          className="scroll-content"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "18px 16px calc(var(--safe-bottom) + 22px)",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          {hasPDF ? (
            <>
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0, marginBottom: 6 }}>
                  {song.pdf!.filename}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0 }}>
                  {(song.pdf!.size / 1_048_576).toFixed(1)} MB
                  {song.pdf!.bookmarks.length > 0 ? ` · ${song.pdf!.bookmarks.length} bookmark${song.pdf!.bookmarks.length > 1 ? "s" : ""}` : ""}
                  {` · Last page ${song.pdf!.lastViewedPage}`}
                </p>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  background: "var(--card)",
                  borderRadius: 14,
                  padding: "16px 14px",
                  boxShadow: "0 0 0 1px var(--separator)",
                }}
              >
                {song.pdf!.parsedText?.trim() ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {song.pdf!.parsedText.split("\n").map((line, i) => renderChordAwareLine(line, i))}
                  </div>
                ) : parsingSheetText ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", gap: 10 }}>
                    <FileText size={34} strokeWidth={1.2} style={{ color: "var(--text-tertiary)" }} />
                    <p style={{ fontSize: 16, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>
                      Preparing readable text...
                    </p>
                    <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: 0, lineHeight: "20px", maxWidth: 280 }}>
                      You can open the original layout immediately below.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", gap: 10 }}>
                    <FileText size={34} strokeWidth={1.2} style={{ color: "var(--text-tertiary)" }} />
                    <p style={{ fontSize: 16, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>
                      Could not parse text from this PDF
                    </p>
                    <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: 0, lineHeight: "20px", maxWidth: 280 }}>
                      You can still open the original PDF layout below.
                    </p>
                  </div>
                )}
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  justifyContent: "center",
                  position: "sticky",
                  bottom: 0,
                  paddingTop: 8,
                  paddingBottom: 4,
                  background: "linear-gradient(to top, var(--background), transparent)",
                }}
              >
                <button
                  onClick={() => setPdfOpen(true)}
                  style={{
                    border: "none",
                    borderRadius: 999,
                    padding: "10px 16px",
                    fontSize: 13,
                    fontWeight: 500,
                    letterSpacing: "-0.1px",
                    color: "var(--foreground)",
                    background: "rgba(255,255,255,0.08)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12), inset 0 0 0 1px rgba(255,255,255,0.22)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    cursor: "pointer",
                  }}
                >
                  View Original PDF Layout
                </button>
              </div>
            </>
          ) : (
            <>
              <FileText size={40} strokeWidth={1} style={{ color: "var(--text-tertiary)", marginBottom: 16 }} />
              <p style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>No sheet attached</p>
              <p style={{ fontSize: 15, color: "var(--text-tertiary)", textAlign: "center", marginBottom: 24, lineHeight: "20px" }}>
                Attach a PDF in edit mode to add sheet music.
              </p>
              <button onClick={() => onEdit(song)} className="btn btn-tinted" style={{ fontSize: 15, height: 44 }}>
                Edit Song
              </button>
            </>
          )}
        </div>
      )}

      {/* ══ Info ══ */}
      {segment === "info" && (
        <div className="scroll-content" style={{ flex: 1, overflowY: "auto", padding: "20px 16px calc(var(--safe-bottom) + 32px)" }}>
          {/* Metadata rows */}
          {(() => {
            const rows = [
              { label: "Artist", value: song.artist },
              { label: "Album",  value: song.album  },
              { label: "Key",    value: song.key    },
              { label: "Capo",   value: song.capo ? `Fret ${song.capo}` : undefined },
            ].filter((r) => r.value)
            return rows.length > 0 ? (
              <div style={{ marginBottom: 24 }}>
                <p className="section-label" style={{ paddingLeft: 16, marginBottom: 6 }}>Details</p>
                <div className="grouped-section">
                  {rows.map(({ label, value }) => (
                    <div key={label} className="grouped-row" style={{ justifyContent: "space-between" }}>
                      <span style={{ fontSize: 17, color: "var(--foreground)", letterSpacing: "-0.41px" }}>{label}</span>
                      <span style={{ fontSize: 17, color: "var(--text-tertiary)", letterSpacing: "-0.41px" }}>{value}</span>
                    </div>
                  ))}
                  {song.notes && (
                    <div className="grouped-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                      <span style={{ fontSize: 13, color: "var(--text-tertiary)", fontWeight: 500 }}>Notes</span>
                      <span style={{ fontSize: 15, color: "var(--foreground)", lineHeight: "20px" }}>{song.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : null
          })()}

          {/* Actions */}
          <p className="section-label" style={{ paddingLeft: 16, marginBottom: 6 }}>Actions</p>
          <div className="grouped-section" style={{ marginBottom: 24 }}>
            <button
              onClick={handleDelete}
              className="grouped-row"
              style={{
                width: "100%",
                border: "none",
                cursor: "pointer",
                gap: 12,
                background: showDeleteConfirm ? "rgba(255,59,48,0.08)" : "var(--card)",
              }}
            >
              <Trash2 size={18} strokeWidth={1.5} style={{ color: "var(--destructive)" }} />
              <span style={{ fontSize: 17, color: "var(--destructive)", letterSpacing: "-0.41px", flex: 1, textAlign: "left" }}>
                {showDeleteConfirm ? "Tap again to confirm" : "Delete Song"}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* PDF full-screen */}
      {pdfOpen && song.pdf && (
        <PDFViewer pdf={song.pdf} songId={song.id} onClose={() => setPdfOpen(false)} onMetaChange={handlePDFMetaChange} />
      )}

      {/* Share toast */}
      {shareToast && (
        <div
          style={{
            position: "absolute",
            top: 80,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.75)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 500,
            padding: "8px 18px",
            borderRadius: 100,
            zIndex: 60,
            whiteSpace: "nowrap",
          }}
        >
          Copied to clipboard
        </div>
      )}
    </div>
  )
}
