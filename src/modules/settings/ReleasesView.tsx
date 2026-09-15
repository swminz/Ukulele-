import { ChevronLeft } from "lucide-react"

interface Release {
  version: string
  date:    string
  items:   string[]
}

// ── Release history — add new entries at the top as the app ships updates ─────
const RELEASES: Release[] = [
  {
    version: "0.0.1",
    date:    "September 2026",
    items: [
      "First release of UkePocket",
      "Reference ukulele tuner with Standard, Low G, D and Baritone tunings",
      "Metronome with tempo wheel, time signature and accent beat control",
      "Song book — write, store and auto-scroll lyrics and chord sheets",
      "PDF music sheet import and viewer",
      "Built-in chord library with custom chord photo support",
      "Backup & Restore — export and import all songs locally",
    ],
  },
]

interface ReleasesViewProps {
  onClose: () => void
}

export function ReleasesView({ onClose }: ReleasesViewProps) {
  return (
    <div style={{ padding: "8px 16px 56px" }}>

      {/* ── Back header ── */}
      <button
        onClick={onClose}
        style={{
          display:     "flex",
          alignItems:  "center",
          gap:         4,
          background:  "none",
          border:      "none",
          cursor:      "pointer",
          color:       "var(--primary)",
          fontSize:    17,
          fontWeight:  400,
          padding:     "0 0 20px 0",
          marginLeft:  -4,
        }}
      >
        <ChevronLeft size={20} strokeWidth={2} />
        What's New
      </button>

      {/* ── Release list ── */}
      {RELEASES.map((release) => (
        <div key={release.version} style={{ marginBottom: 32 }}>
          <p
            className="section-label"
            style={{ paddingLeft: 16, marginBottom: 8 }}
          >
            {release.version} — {release.date}
          </p>
          <div className="grouped-section">
            {release.items.map((item, i) => (
              <div key={i} className="grouped-row">
                <p style={{
                  fontSize:      15,
                  color:         "var(--foreground)",
                  letterSpacing: "-0.24px",
                  lineHeight:    "20px",
                }}>
                  {item}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
