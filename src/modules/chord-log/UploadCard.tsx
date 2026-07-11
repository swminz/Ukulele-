import { useState, useRef, useEffect, useCallback } from "react"
import type { Song } from "@/types"
import { Play, Pause, FileText, Music2, ChevronRight, Heart } from "lucide-react"
import { SwipeableRow } from "./SwipeableRow"

function formatDuration(s: number) {
  if (!isFinite(s)) return "--:--"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Audio Upload Card ──────────────────────────────────────────────────────────
interface AudioCardProps {
  song: Song
  onOpen: () => void
  onToggleFavorite: () => void
  onDelete: () => void
}

export function AudioUploadCard({ song, onOpen, onToggleFavorite, onDelete }: AudioCardProps) {
  const audio    = song.audio!
  const [playing,  setPlaying]  = useState(false)
  const [progress, setProgress] = useState(0)       // 0-1
  const [duration, setDuration] = useState(audio.duration ?? 0)
  const [elapsed,  setElapsed]  = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef   = useRef<string | null>(null)

  // Create blob URL once
  const getUrl = useCallback(() => {
    if (!urlRef.current) {
      const blob = new Blob([audio.data], { type: audio.mimeType })
      urlRef.current = URL.createObjectURL(blob)
    }
    return urlRef.current
  }, [audio])

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const el = new Audio(getUrl())
      el.addEventListener("timeupdate", () => {
        setElapsed(el.currentTime)
        setProgress(el.duration ? el.currentTime / el.duration : 0)
      })
      el.addEventListener("loadedmetadata", () => setDuration(el.duration))
      el.addEventListener("ended", () => { setPlaying(false); setProgress(0); setElapsed(0); el.currentTime = 0 })
      audioRef.current = el
    }
    return audioRef.current
  }, [getUrl])

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    const el = ensureAudio()
    if (playing) { el.pause(); setPlaying(false) }
    else         { void el.play(); setPlaying(true) }
  }

  const ext = audio.filename.split(".").pop()?.toUpperCase() ?? "AUDIO"

  return (
    <SwipeableRow onDelete={onDelete}>
    <div
      className="grouped-row"
      style={{ cursor: "pointer", padding: "12px 16px 12px 12px", gap: 0, flexDirection: "column", alignItems: "stretch" }}
      onClick={onOpen}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Play / pause button */}
        <button
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          style={{
            width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
            background: "var(--primary)", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,122,255,0.25)",
          }}
          onPointerDown={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).style.transform = "scale(0.9)" }}
          onPointerUp={(e)   => { (e.currentTarget as HTMLElement).style.transform = "scale(1)" }}
          onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)" }}
        >
          {playing
            ? <Pause  size={16} strokeWidth={2} style={{ color: "#FFF" }} />
            : <Play   size={16} strokeWidth={2} style={{ color: "#FFF", marginLeft: 2 }} />}
        </button>

        {/* Title + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 16, fontWeight: 500, letterSpacing: "-0.3px",
            color: "var(--foreground)", overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0,
          }}>
            {song.title || audio.filename}
          </p>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0, marginTop: 2 }}>
            {playing ? formatDuration(elapsed) : formatDuration(duration)}
            {" · "}{formatSize(audio.size)}{" · "}{ext}
          </p>
        </div>

        {/* Favorite + chevron */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
          aria-label={song.favorite ? "Remove from favorites" : "Add to favorites"}
          style={{ background: "none", border: "none", padding: "4px 2px", cursor: "pointer", display: "flex", alignItems: "center" }}
        >
          <Heart size={16} strokeWidth={1.5}
            fill={song.favorite ? "var(--destructive)" : "none"}
            style={{ color: song.favorite ? "var(--destructive)" : "var(--text-tertiary)", transition: "color 0.15s, fill 0.15s" }} />
        </button>
        <ChevronRight size={16} strokeWidth={1.8}
          style={{ color: "var(--text-tertiary)", flexShrink: 0, opacity: 0.45, marginLeft: -2 }} />
      </div>

      {/* Progress bar */}
      <div style={{ marginTop: 10, marginLeft: 50, height: 3, background: "rgba(60,60,67,0.12)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${progress * 100}%`, background: "var(--primary)",
          borderRadius: 2, transition: "width 0.25s linear",
        }} />
      </div>
    </div>
    </SwipeableRow>
  )
}

// ── PDF Upload Card ────────────────────────────────────────────────────────────
interface PDFCardProps {
  song: Song
  onOpen: () => void
  onToggleFavorite: () => void
  onDelete: () => void
}

export function PDFUploadCard({ song, onOpen, onToggleFavorite, onDelete }: PDFCardProps) {
  const pdf = song.pdf!
  const ext = pdf.filename.split(".").pop()?.toUpperCase() ?? "PDF"

  return (
    <SwipeableRow onDelete={onDelete}>
    <div
      className="grouped-row"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      aria-label={`Open ${song.title || pdf.filename}`}
      style={{ cursor: "pointer", gap: 0, padding: "0 16px 0 0" }}
    >
      {/* Favorite button */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
        aria-label={song.favorite ? "Remove from favorites" : "Add to favorites"}
        style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 44, minHeight: 48, flexShrink: 0,
        }}
      >
        <Heart size={16} strokeWidth={1.5}
          fill={song.favorite ? "var(--destructive)" : "none"}
          style={{ color: song.favorite ? "var(--destructive)" : "var(--text-tertiary)", transition: "color 0.15s, fill 0.15s" }} />
      </button>

      {/* PDF icon */}
      <div style={{
        width: 36, height: 36, borderRadius: 8, background: "rgba(120,120,128,0.1)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, marginRight: 10,
      }}>
        <FileText size={18} strokeWidth={1.5} style={{ color: "var(--text-tertiary)" }} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0, padding: "12px 8px 12px 0" }}>
        <p style={{
          fontSize: 17, fontWeight: 400, letterSpacing: "-0.41px",
          color: "var(--foreground)", overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {song.title || pdf.filename}
        </p>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", letterSpacing: "-0.1px" }}>
          {ext}{" · "}{formatSize(pdf.size)}
        </p>
      </div>

      <Music2 size={13} style={{ color: "var(--text-tertiary)", flexShrink: 0, opacity: 0.5, marginRight: 6 }} />
      <ChevronRight size={16} strokeWidth={1.8} style={{ color: "var(--text-tertiary)", flexShrink: 0, opacity: 0.45 }} />
    </div>
    </SwipeableRow>
  )
}
