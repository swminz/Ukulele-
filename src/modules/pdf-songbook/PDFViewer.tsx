import * as pdfjsLib from "pdfjs-dist"
import type { PDFDocumentProxy } from "pdfjs-dist"
import type { SongPDF } from "@/types"
import { updateSongPDFMeta } from "@/lib/db"
import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { X, ZoomIn, ZoomOut, TriangleAlert, PanelLeft, Bookmark, Minimize2, Maximize2 } from "lucide-react"

// Keep viewer startup fast by using local bundled worker (no network wait).
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString()

interface Props {
  pdf: SongPDF
  songId: string
  onClose: () => void
  /** Called after page or bookmarks are persisted so the parent can update its state */
  onMetaChange?: (updated: Partial<SongPDF>) => void
}

export function PDFViewer({ pdf, songId, onClose, onMetaChange }: Props) {
  const [doc,          setDoc]          = useState<PDFDocumentProxy | null>(null)
  const [numPages,     setNumPages]     = useState(0)
  const [currentPage,  setCurrentPage]  = useState(pdf.lastViewedPage)
  const [scale,        setScale]        = useState(1.2)
  const [loading,      setLoading]      = useState(true)
  const [renderError,  setRenderError]  = useState(false)
  const [showThumbs,   setShowThumbs]   = useState(false)
  const [readingMode,  setReadingMode]  = useState(false)
  const [bookmarks,    setBookmarks]    = useState<number[]>(pdf.bookmarks ?? [])

  const pageRefs        = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const thumbRefs       = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const renderTasksRef  = useRef<Map<number, { cancel: () => void }>>(new Map())
  const scrollRef       = useRef<HTMLDivElement>(null)
  const saveTimerRef    = useRef<number | null>(null)
  const pinchRef        = useRef<{ startDistance: number; startScale: number } | null>(null)
  const tapRef          = useRef(0)

  const pageNumbers = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages])

  // Load document
  useEffect(() => {
    setLoading(true)
    setRenderError(false)
    // Avoid cloning large buffers here; pass directly for faster open.
    const task = pdfjsLib.getDocument({ data: pdf.data })
    task.promise
      .then((pdfDoc) => {
        setDoc(pdfDoc)
        setNumPages(pdfDoc.numPages)
        setCurrentPage(Math.min(pdf.lastViewedPage, pdfDoc.numPages))
        setLoading(false)
      })
      .catch(() => { setRenderError(true); setLoading(false) })
    return () => { void task.destroy() }
  }, [pdf])

  // Render pages
  const renderSingle = useCallback(async (pageNum: number, canvas: HTMLCanvasElement, renderScale: number) => {
    if (!doc) return
    renderTasksRef.current.get(pageNum)?.cancel()
    try {
      const page     = await doc.getPage(pageNum)
      const viewport = page.getViewport({ scale: renderScale })
      const ctx      = canvas.getContext("2d")
      if (!ctx) return
      canvas.width  = viewport.width
      canvas.height = viewport.height
      const task = page.render({ canvasContext: ctx, viewport, canvas })
      renderTasksRef.current.set(pageNum, task)
      await task.promise
      renderTasksRef.current.delete(pageNum)
    } catch (err: unknown) {
      const isCancel = err && typeof err === "object" && "name" in err && (err as { name: string }).name === "RenderingCancelledException"
      if (!isCancel) setRenderError(true)
    }
  }, [doc])

  useEffect(() => {
    if (!doc || numPages === 0) return
    let cancelled = false
    let timer: number | null = null
    const renderScale = Math.max(0.7, Math.min(3.5, scale))

    // Prioritize current page for instant visible feedback.
    const orderedPages = [currentPage, ...pageNumbers.filter((n) => n !== currentPage)]

    // Render current page immediately (awaited), then progressively chunk the rest.
    const run = async () => {
      const firstCanvas = pageRefs.current.get(currentPage)
      if (firstCanvas) await renderSingle(currentPage, firstCanvas, renderScale)
      if (cancelled) return

      let idx = 0
      const remaining = orderedPages.filter((n) => n !== currentPage)
      const pump = () => {
        if (cancelled) return
        const chunkSize = 2
        const end = Math.min(idx + chunkSize, remaining.length)
        for (; idx < end; idx++) {
          const n = remaining[idx]
          const c = pageRefs.current.get(n)
          if (c) void renderSingle(n, c, renderScale)
        }
        if (idx < remaining.length) {
          timer = window.setTimeout(pump, 30)
        }
      }
      pump()

      // Thumbnails are lower priority; render only when the sidebar is shown.
      if (showThumbs) {
        pageNumbers.forEach((n) => {
          const c = thumbRefs.current.get(n)
          if (c) void renderSingle(n, c, 0.2)
        })
      }
    }

    void run()
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [doc, numPages, pageNumbers, renderSingle, scale, currentPage, showThumbs])

  // Persist page + bookmarks
  const persistMeta = useCallback(async (patch: Partial<SongPDF>) => {
    await updateSongPDFMeta(songId, patch)
    onMetaChange?.(patch)
  }, [songId, onMetaChange])

  const toggleBookmark = useCallback(async () => {
    const exists = bookmarks.includes(currentPage)
    const next   = exists ? bookmarks.filter((p) => p !== currentPage) : [...bookmarks, currentPage].sort((a, b) => a - b)
    setBookmarks(next)
    await persistMeta({ bookmarks: next })
  }, [bookmarks, currentPage, persistMeta])

  // Scroll tracking
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const onScroll = () => {
      let best = 1; let bestDist = Infinity
      pageNumbers.forEach((n) => {
        const c = pageRefs.current.get(n)
        if (!c) return
        const dist = Math.abs(c.getBoundingClientRect().top - 120)
        if (dist < bestDist) { bestDist = dist; best = n }
      })
      setCurrentPage(best)
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = window.setTimeout(() => void persistMeta({ lastViewedPage: best }), 300)
    }
    container.addEventListener("scroll", onScroll, { passive: true })
    return () => container.removeEventListener("scroll", onScroll)
  }, [pageNumbers, persistMeta])

  // Cleanup
  useEffect(() => () => {
    renderTasksRef.current.forEach((t) => t.cancel())
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
  }, [])

  const scrollToPage = (n: number) => pageRefs.current.get(n)?.scrollIntoView({ behavior: "smooth", block: "start" })

  // Pinch zoom
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) return
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    pinchRef.current = { startDistance: Math.hypot(dx, dy), startScale: scale }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchRef.current) return
    e.preventDefault()
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    setScale(Math.max(0.7, Math.min(3.5, pinchRef.current.startScale * Math.hypot(dx, dy) / pinchRef.current.startDistance)))
  }
  const onTouchEnd  = () => { pinchRef.current = null }

  // Double-tap zoom
  const onPageTap = () => {
    const now = Date.now()
    if (now - tapRef.current < 260) {
      setScale((p) => (p < 1.5 ? 2.2 : 1))
      tapRef.current = 0
      return
    }
    tapRef.current = now
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col modal-slide-up"
      style={{ background: "var(--background)", paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Toolbar */}
      {!readingMode && (
        <div className="flex items-center gap-2 px-3 py-3 shrink-0" style={{ borderBottom: "1px solid var(--separator)" }}>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-xl active:scale-90" style={{ background: "var(--muted)" }}>
            <X className="w-4 h-4" />
          </button>
          <p className="flex-1 text-sm font-medium truncate">{pdf.filename}</p>
          <button onClick={() => setShowThumbs((v) => !v)} aria-label="Toggle thumbnails" className="w-9 h-9 flex items-center justify-center rounded-xl active:scale-90" style={{ background: showThumbs ? "var(--accent)" : "var(--muted)" }}>
            <PanelLeft className="w-4 h-4" />
          </button>
          <button onClick={toggleBookmark} aria-label="Bookmark page" className="w-9 h-9 flex items-center justify-center rounded-xl active:scale-90" style={{ background: "var(--muted)" }}>
            <Bookmark className="w-4 h-4" fill={bookmarks.includes(currentPage) ? "var(--primary)" : "none"} stroke={bookmarks.includes(currentPage) ? "var(--primary)" : "currentColor"} />
          </button>
          <button onClick={() => setScale((s) => Math.max(0.7, s - 0.2))} aria-label="Zoom out" className="w-9 h-9 flex items-center justify-center rounded-xl active:scale-90" style={{ background: "var(--muted)" }}>
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={() => setScale((s) => Math.min(3.5, s + 0.2))} aria-label="Zoom in" className="w-9 h-9 flex items-center justify-center rounded-xl active:scale-90" style={{ background: "var(--muted)" }}>
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={() => setReadingMode(true)} aria-label="Full screen" className="w-9 h-9 flex items-center justify-center rounded-xl active:scale-90" style={{ background: "var(--muted)" }}>
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Thumbnail sidebar */}
        {!readingMode && showThumbs && (
          <aside className="w-24 shrink-0 overflow-y-auto p-2 border-r" style={{ borderColor: "var(--separator)", background: "var(--surface-secondary)" }}>
            <div className="flex flex-col gap-2">
              {pageNumbers.map((n) => (
                <button key={`th-${n}`} onClick={() => scrollToPage(n)} aria-label={`Page ${n}`} className="p-1.5 rounded-lg border" style={{ borderColor: n === currentPage ? "var(--primary)" : "var(--separator)", background: "var(--surface-elevated)" }}>
                  <canvas ref={(el) => { if (el) thumbRefs.current.set(n, el); else thumbRefs.current.delete(n) }} className="w-full rounded" />
                  <p className="text-[10px] mt-1 text-center" style={{ color: "var(--text-tertiary)" }}>{n}</p>
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* Scroll area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto scroll-content pdf-page-container"
          style={{ background: readingMode ? "#000" : "var(--background)" }}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        >
          {loading && (
            <div className="flex items-center justify-center h-full flex-col gap-3">
              <div className="w-10 h-10 rounded-full border-2 animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
              <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Loading PDF…</p>
            </div>
          )}
          {renderError && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center px-6">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: "var(--surface-secondary)" }}>
                  <TriangleAlert className="w-6 h-6" style={{ color: "var(--destructive)" }} />
                </div>
                <p className="font-semibold mb-1">Could not render PDF</p>
                <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>The file may be corrupted or password-protected.</p>
              </div>
            </div>
          )}
          {!loading && !renderError && (
            <div className="flex flex-col items-center gap-4 p-4" onClick={onPageTap}>
              {pageNumbers.map((n) => (
                <div key={`pg-${n}`} className="relative">
                  <canvas
                    ref={(el) => { if (el) pageRefs.current.set(n, el); else pageRefs.current.delete(n) }}
                    className="rounded-lg max-w-full"
                    style={{ boxShadow: readingMode ? "none" : "0 4px 16px rgba(0,0,0,0.12)" }}
                  />
                  {bookmarks.includes(n) && !readingMode && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: "var(--accent)", color: "var(--primary)" }}>
                      Bookmarked
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Page counter */}
      {!readingMode && numPages > 0 && (
        <div className="flex items-center justify-between px-6 py-3 shrink-0" style={{ borderTop: "1px solid var(--separator)", paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}>
          <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            <span className="font-semibold" style={{ color: "var(--foreground)" }}>{currentPage}</span> / {numPages}
          </span>
          <button onClick={() => setReadingMode(true)} aria-label="Full screen" className="w-10 h-10 flex items-center justify-center rounded-xl active:scale-90" style={{ background: "var(--muted)" }}>
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Exit full-screen */}
      {readingMode && (
        <button onClick={() => setReadingMode(false)} aria-label="Exit full screen" className="absolute top-4 right-4 w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)", color: "#fff" }}>
          <Minimize2 className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
