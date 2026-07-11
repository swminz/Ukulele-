import { useState } from "react"
import { ReferenceTuner } from "@/modules/tuner/ReferenceTuner"
import { Metronome } from "./Metronome"

type Screen = "tuner" | "metronome"

export function PracticeTab() {
  const [screen, setScreen] = useState<Screen>("tuner")

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        height:        "100%",
        background:    "var(--background)",
      }}
    >
      {/* ── Underline-style tab bar (matches reference) ────────────────── */}
      <div
        style={{
          display:    "flex",
          flexShrink: 0,
          borderBottom: "1px solid var(--separator)",
        }}
      >
        {(["tuner", "metronome"] as Screen[]).map((id) => {
          const active = screen === id
          return (
            <button
              key={id}
              onClick={() => setScreen(id)}
              aria-pressed={active}
              style={{
                flex:           1,
                padding:        "13px 0 11px",
                background:     "none",
                border:         "none",
                borderBottom:   active
                  ? "2px solid var(--primary)"
                  : "2px solid transparent",
                marginBottom:   -1,          // overlap parent separator
                color:          active ? "var(--primary)" : "var(--text-tertiary)",
                fontSize:       15,
                fontWeight:     active ? 600 : 400,
                letterSpacing:  "-0.24px",
                cursor:         "pointer",
                transition:     "color 0.15s ease, border-color 0.15s ease",
              }}
            >
              {id === "tuner" ? "Tuner" : "Metronome"}
            </button>
          )
        })}
      </div>

      {/* ── Screen content ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {screen === "tuner"     && <ReferenceTuner />}
        {screen === "metronome" && <Metronome />}
      </div>
    </div>
  )
}
