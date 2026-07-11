import type { Song } from "@/types"
import { Heart, ChevronRight, FileText } from "lucide-react"
import { SwipeableRow } from "./SwipeableRow"

interface Props {
  song: Song
  onOpen: () => void
  onToggleFavorite: () => void
  onDelete: () => void
}

function relativeDate(ts: number) {
  const diff = Date.now() - ts
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7)  return `${days}d ago`
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function SongCard({ song, onOpen, onToggleFavorite, onDelete }: Props) {
  const hasPDF   = Boolean(song.pdf)
  const artist   = song.artist?.trim()
  const hasMeta  = artist || song.key || song.capo

  return (
    <SwipeableRow onDelete={onDelete}>
    <div
      className="grouped-row"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      aria-label={`Open ${song.title || "Untitled"}`}
      style={{ cursor: "pointer", gap: 0, padding: "0 16px 0 0" }}
    >
      {/* Favorite — 44×48 tap target */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
        aria-label={song.favorite ? "Remove from favorites" : "Add to favorites"}
        style={{
          background:      "none",
          border:          "none",
          padding:         0,
          cursor:          "pointer",
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
          width:           44,
          minHeight:       48,
          flexShrink:      0,
        }}
      >
        <Heart
          size={16}
          strokeWidth={1.5}
          fill={song.favorite ? "var(--destructive)" : "none"}
          style={{
            color:      song.favorite ? "var(--destructive)" : "var(--text-tertiary)",
            transition: "color 0.15s, fill 0.15s",
          }}
        />
      </button>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, padding: "12px 8px 12px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: hasMeta ? 2 : 0 }}>
          <p
            style={{
              fontSize:     17,
              fontWeight:   400,
              letterSpacing:"-0.41px",
              color:        "var(--foreground)",
              overflow:     "hidden",
              textOverflow: "ellipsis",
              whiteSpace:   "nowrap",
              flex:         1,
            }}
          >
            {song.title || "Untitled"}
          </p>
          {hasPDF && (
            <FileText size={13} style={{ color: "var(--text-tertiary)", flexShrink: 0, opacity: 0.7 }} />
          )}
        </div>

        {hasMeta && (
          <p
            style={{
              fontSize:     14,
              color:        "var(--text-tertiary)",
              overflow:     "hidden",
              textOverflow: "ellipsis",
              whiteSpace:   "nowrap",
              letterSpacing:"-0.1px",
            }}
          >
            {[
              artist,
              song.key  ? `Key of ${song.key}` : null,
              song.capo ? `Capo ${song.capo}`  : null,
            ].filter(Boolean).join(" · ")}
            <span style={{ opacity: 0.6 }}>{" · "}{relativeDate(song.modifiedAt)}</span>
          </p>
        )}

        {!hasMeta && (
          <p style={{ fontSize: 14, color: "var(--text-tertiary)", opacity: 0.6 }}>
            {relativeDate(song.modifiedAt)}
          </p>
        )}
      </div>

      <ChevronRight
        size={16}
        strokeWidth={1.8}
        style={{ color: "var(--text-tertiary)", flexShrink: 0, opacity: 0.45 }}
      />
    </div>
    </SwipeableRow>
  )
}
