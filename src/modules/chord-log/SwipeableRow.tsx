import { useRef, useState, useEffect } from "react"
import { Trash2 } from "lucide-react"

const DELETE_W = 80

// Custom event used to coordinate exclusive open state across all rows.
// When one row opens, it broadcasts its unique ID so all others close.
const SWIPE_EVENT = "swipe-row-opened"

interface Props {
  onDelete: () => void
  children: React.ReactNode
}

/**
 * iOS-style swipe-to-delete wrapper.
 *
 * Uses window-level pointermove/pointerup listeners instead of
 * setPointerCapture so that click events on child elements are
 * never swallowed on iOS Safari / mobile browsers.
 *
 * Only one row can be open at a time — opening one automatically
 * closes any other that is currently revealed.
 */
export function SwipeableRow({ onDelete, children }: Props) {
  const rowRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [open, setOpen]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const startX   = useRef(0)
  const baseOff  = useRef(0)
  // True only when the finger actually slid horizontally > threshold
  const wasDrag  = useRef(false)
  // Stable unique ID for this row instance
  const rowId = useRef(`sr_${Math.random().toString(36).slice(2)}`)

  const snap = (toOpen: boolean, broadcast = true) => {
    setOpen(toOpen)
    const el = contentRef.current
    if (!el) return
    el.style.transition = "transform 0.22s cubic-bezier(0.25,0.46,0.45,0.94)"
    el.style.transform  = `translateX(${toOpen ? -DELETE_W : 0}px)`
    // Notify sibling rows to close when this one opens
    if (toOpen && broadcast) {
      window.dispatchEvent(new CustomEvent(SWIPE_EVENT, { detail: { id: rowId.current } }))
    }
  }

  // Close self when another row announces it has opened
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ id: string }>
      if (ce.detail.id !== rowId.current) snap(false, false)
    }
    window.addEventListener(SWIPE_EVENT, handler)
    return () => window.removeEventListener(SWIPE_EVENT, handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Close when user taps anywhere outside this row while it's open.
  // This replaces the fixed backdrop so it never blocks the delete button.
  useEffect(() => {
    if (!open) return
    const onDocDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!rowRef.current || !target) return
      if (!rowRef.current.contains(target)) snap(false, false)
    }
    document.addEventListener("pointerdown", onDocDown, true)
    return () => document.removeEventListener("pointerdown", onDocDown, true)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    startX.current  = e.clientX
    baseOff.current = open ? -DELETE_W : 0
    wasDrag.current = false
    const el = contentRef.current

    const onMove = (me: PointerEvent) => {
      const delta = me.clientX - startX.current
      if (!wasDrag.current) {
        if (Math.abs(delta) < 8) return
        wasDrag.current = true
      }
      const clamped = Math.max(-DELETE_W, Math.min(0, baseOff.current + delta))
      if (el) {
        el.style.transition = "none"
        el.style.transform  = `translateX(${clamped}px)`
      }
    }

    const onUp = (ue: PointerEvent) => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup",   onUp)
      if (!wasDrag.current) return     // pure tap — let click propagate normally
      const delta = ue.clientX - startX.current
      snap(baseOff.current + delta < -DELETE_W / 2.5)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup",   onUp)
  }

  // Capture phase: intercept click BEFORE it reaches the child row so we can
  // suppress it after a swipe, or close the open state on row-tap.
  const handleClickCapture = (e: React.MouseEvent) => {
    if (wasDrag.current) {
      e.stopPropagation()
      e.preventDefault()
      wasDrag.current = false
      return
    }
    if (open) {
      e.stopPropagation()
      snap(false)
    }
    // Normal tap while closed → do nothing; click reaches child naturally
  }

  return (
    <div
      ref={rowRef}
      className="swipe-row"
      style={{
        opacity: deleting ? 0 : 1,
        transform: deleting ? "scale(0.985)" : "scale(1)",
        transition: "opacity 0.16s ease, transform 0.16s ease",
      }}
    >
      {/* Red delete action — inset 1 px from top+bottom so it never bleeds
          into the separator hairline that sits at top:0 of the next row */}
      <div
        aria-hidden
        style={{
          position:       "absolute",
          right:          0,
          top:            1,           // keep 1 px clear of separator line
          bottom:         1,
          width:          DELETE_W,
          background:     "#FF3B30",
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          gap:            3,
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (deleting) return
            setDeleting(true)
            window.setTimeout(() => onDelete(), 150)
          }}
          aria-label="Delete"
          style={{
            width:          "100%",
            height:         "100%",
            background:     "none",
            border:         "none",
            cursor:         "pointer",
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            justifyContent: "center",
            gap:            4,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Trash2 size={20} strokeWidth={1.5} style={{ color: "#FFF" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#FFF", letterSpacing: "0.1px" }}>
            Delete
          </span>
        </button>
      </div>

      {/* Sliding content
          position:relative + z-index:1 ensure this always paints above the
          absolutely-positioned red div regardless of stacking-context edge cases.
          background:var(--card) covers any sub-pixel gap on the right edge. */}
      <div
        ref={contentRef}
        style={{
          position:    "relative",
          zIndex:      1,
          transform:   "translateX(0)",
          willChange:  "transform",
          touchAction: "pan-y",
          background:  "var(--card)",
        }}
        onPointerDown={handlePointerDown}
        onClickCapture={handleClickCapture}
      >
        {children}
      </div>
    </div>
  )
}
