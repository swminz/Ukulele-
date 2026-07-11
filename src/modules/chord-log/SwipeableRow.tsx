import { useRef, useState } from "react"
import { Trash2 } from "lucide-react"

const DELETE_W = 80

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
 */
export function SwipeableRow({ onDelete, children }: Props) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [open, setOpen]   = useState(false)
  const startX   = useRef(0)
  const baseOff  = useRef(0)
  // True only when the finger actually slid horizontally > threshold
  const wasDrag  = useRef(false)

  const snap = (toOpen: boolean) => {
    setOpen(toOpen)
    const el = contentRef.current
    if (!el) return
    el.style.transition = "transform 0.22s cubic-bezier(0.25,0.46,0.45,0.94)"
    el.style.transform  = `translateX(${toOpen ? -DELETE_W : 0}px)`
  }

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
    <div className="swipe-row">
      {/* Red delete action — sits behind the sliding content */}
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
          <Trash2 size={20} strokeWidth={1.5} style={{ color: "#FFF" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#FFF", letterSpacing: "0.1px" }}>
            Delete
          </span>
        </button>
      </div>

      {/* Sliding content — explicit card background prevents red bleed-through */}
      <div
        ref={contentRef}
        style={{
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

      {/* Backdrop — tap outside the revealed button to close */}
      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 5 }}
          onClick={() => snap(false)}
        />
      )}
    </div>
  )
}
