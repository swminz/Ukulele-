interface MetronomeMiniPlayerProps {
  bpm:             number
  running:         boolean
  beat:            number
  onToggleRunning: () => void
  onStop:          () => void
  onOpen:          () => void
}

function PauseIcon() {
  return (
    <svg width="13" height="15" viewBox="0 0 13 15" aria-hidden>
      <rect x="1" y="0" width="4" height="15" rx="1.5" fill="currentColor"/>
      <rect x="8" y="0" width="4" height="15" rx="1.5" fill="currentColor"/>
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="13" height="15" viewBox="0 0 13 15" aria-hidden>
      <path
        d="M1 1.3 L12 7.5 L1 13.7 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function MetronomeMiniPlayer({
  bpm, running, beat, onToggleRunning, onStop, onOpen,
}: MetronomeMiniPlayerProps) {
  return (
    <>
      <style>{`
        @keyframes miniPlayerIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Outer wrapper */}
      <div
        style={{
          padding:    "0 14px 8px",
          flexShrink: 0,
          animation:  "miniPlayerIn 0.22s cubic-bezier(0.22,1,0.36,1) both",
        }}
      >
        {/*
          Pill card — the ENTIRE pill is the navigation tap target.
          The control buttons call e.stopPropagation() so they never
          trigger this onClick. This eliminates any ambiguity about which
          element owns the "open" interaction, and removes the ghost-click
          risk from a sibling div[role="button"] getting stray events.
        */}
        <div
          role="button"
          aria-label="Open Metronome"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen() }}
          style={{
            display:                    "flex",
            alignItems:                 "center",
            height:                     54,
            background:                 "var(--card)",
            borderRadius:               "9999px",
            boxShadow:                  "0 2px 18px rgba(0,0,0,0.10), 0 0 0 0.5px rgba(60,60,67,0.10)",
            cursor:                     "pointer",
            // Disable the 300 ms synthesised-click delay on Android WebView.
            // This prevents ghost clicks from landing on newly revealed elements
            // when the mini-player state changes.
            touchAction:                "manipulation",
            // Don't show the system tap-highlight on the whole pill when the
            // user taps a control button inside it.
            WebkitTapHighlightColor:    "transparent",
            userSelect:                 "none",
          }}
        >

          {/* Left content — purely visual, no pointer-event handling.
              Clicks bubble up to the pill card's onOpen. */}
          <div
            style={{
              flex:        1,
              display:     "flex",
              alignItems:  "center",
              gap:         10,
              paddingLeft: 22,
              minWidth:    0,
            }}
          >
            {/* Beat pulse dot */}
            <div style={{
              width:        7,
              height:       7,
              borderRadius: "50%",
              flexShrink:   0,
              background:   "var(--primary)",
              opacity:      beat > 0 ? 0.80 : 0.18,
              transition:   "opacity 80ms ease",
            }} />

            <span style={{
              fontSize:           15,
              fontWeight:         600,
              letterSpacing:      "-0.3px",
              color:              "var(--foreground)",
              fontVariantNumeric: "tabular-nums",
              whiteSpace:         "nowrap",
            }}>
              {bpm} BPM
            </span>
          </div>

          {/* ── Control buttons ────────────────────────────────────────────
               Both buttons:
               - Are real <button> elements (correct semantics, keyboard accessible)
               - Call e.stopPropagation() on onClick AND onPointerDown
                 so they never bubble up to the pill card's onOpen handler
               - Have 44×44 px touch targets (minimum recommended for mobile)
               - Have 16 px gap between them for safe one-handed tapping
          ── */}
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:          16,
            paddingRight: 10,
            flexShrink:   0,
          }}>

            {/* Pause / Resume */}
            <button
              onClick={(e) => { e.stopPropagation(); onToggleRunning() }}
              aria-label={running ? "Pause metronome" : "Resume metronome"}
              style={{
                width:          44,
                height:         44,
                border:         "none",
                background:     "transparent",
                cursor:         "pointer",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                flexShrink:     0,
                padding:        0,
                touchAction:    "manipulation",
                transition:     "transform 0.1s ease",
              }}
              onPointerDown={(e) => {
                e.stopPropagation()
                ;(e.currentTarget as HTMLElement).style.transform = "scale(0.9)"
              }}
              onPointerUp={(e) => {
                ;(e.currentTarget as HTMLElement).style.transform = "scale(1)"
              }}
              onPointerCancel={(e) => {
                ;(e.currentTarget as HTMLElement).style.transform = "scale(1)"
              }}
            >
              <div style={{
                width:          38,
                height:         38,
                borderRadius:   "50%",
                background:     "var(--primary)",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                color:          "#FFFFFF",
                pointerEvents:  "none",
              }}>
                {running ? <PauseIcon /> : <PlayIcon />}
              </div>
            </button>

            {/* Stop / Close */}
            <button
              onClick={(e) => { e.stopPropagation(); onStop() }}
              aria-label="Stop metronome"
              style={{
                width:          44,
                height:         44,
                border:         "none",
                background:     "transparent",
                cursor:         "pointer",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                flexShrink:     0,
                fontSize:       17,
                color:          "var(--text-tertiary)",
                padding:        0,
                touchAction:    "manipulation",
                transition:     "color 0.15s ease",
              }}
              onPointerDown={(e) => {
                e.stopPropagation()
                ;(e.currentTarget as HTMLElement).style.color = "var(--foreground)"
              }}
              onPointerUp={(e) => {
                ;(e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"
              }}
              onPointerCancel={(e) => {
                ;(e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"
              }}
            >
              ✕
            </button>

          </div>
        </div>
      </div>
    </>
  )
}
