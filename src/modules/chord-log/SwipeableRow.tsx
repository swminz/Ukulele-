import { useRef, useState } from "react"
import { Trash2 } from "lucide-react"

const DELETE_W = 80   // width of the revealed delete button

interface Props {
  onDelete: () => void
  children:  React.ReactNode
}

/**
 * iOS-style swipe-to-delete wrapper.
 *
 * • Swipe left  → reveals red Delete button
 * • Tap Delete  → calls onDelete()
 * • Tap elsewhere / swipe right → closes
 *
 * Place this as a direct child of .grouped-section so the
 * .swipe-row + .swipe-row separator rule fires correctly.
 */
export function SwipeableRow({ onDelete, children }: Props) {
  const contentRef = useRef<HTMLDivElement>(null)
  const startX     = useRef(0)
  const baseOffset = useRef(0)
  const dragging   = useRef(false)
  const movedPx    = useRef(0)
  const [open, setOpen]  = useState(false)

  // Animate content to a target x offset
  const snap = (toOpen: boolean) => {
    const el = contentRef.current
    if (!el) return
    setOpen(toOpen)
    el.style.transition = "transform 0.22s cubic-bezier(0.25,0.46,0.45,0.94)"
    el.style.transform  = `translateX(${toOpen ? -DELETE_W : 0}px)`
  }

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current    = e.clientX
    baseOffset.current = open ? -DELETE_W : 0
    movedPx.current   = 0
    dragging.current  = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    const delta   = e.clientX - startX.current
    movedPx.current = Math.abs(delta)
    const clamped = Math.max(-DELETE_W, Math.min(0, baseOffset.current + delta))
    const el = contentRef.current
    if (el) {
      el.style.transition = "none"
      el.style.transform  = `translateX(${clamped}px)`
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return
    dragging.current = false
    const delta = e.clientX - startX.current
    const final = baseOffset.current + delta
    snap(final < -DELETE_W / 2.5)
  }

  // Suppress the tap handler when the user actually swiped
  const onClickCapture = (e: React.MouseEvent) => {
    if (movedPx.current > 8) {
      e.stopPropagation()
      e.preventDefault()
      movedPx.current = 0
    } else if (open) {
      // Tapping the row while open → close the action
      e.stopPropagation()
      snap(false)
    }
  }

  return (
    <div className="swipe-row">
      {/* Red delete button (always rendered, revealed by sliding content) */}
      <div
        aria-hidden
        style={{
          position:       "absolute",
          right:          0,
          top:            0,
          bottom:         0,
          width:          DELETE_W,
          background:     "#FF3B30",
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          gap:            3,
          userSelect:     "none",
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
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
          <Trash2 size={20} strokeWidth={1.5} style={{ color: "#FFFFFF" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#FFFFFF", letterSpacing: "0.1px" }}>
            Delete
          </span>
        </button>
      </div>

      {/* Sliding content */}
      <div
        ref={contentRef}
        style={{ transform: "translateX(0)", willChange: "transform", touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>

      {/* Invisible full-screen backdrop — tap to close */}
      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 5 }}
          onPointerDown={() => snap(false)}
        />
      )}
    </div>
  )
}
