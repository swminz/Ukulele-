import { useState, useEffect, useCallback, useRef } from "react"
import { playString, stopString, haptic } from "@/lib/audio"
import {
  startPitchDetection,
  stopPitchDetection,
  centsDifference,
  type PitchDetectionResult,
} from "@/lib/pitch"
import { ChevronDown, Check, Mic } from "lucide-react"

// ── Tunings ───────────────────────────────────────────────────────────────────
interface StringDef { name: string; freq: number; octave: number }
interface TuningPreset { id: string; label: string; short: string; strings: StringDef[] }

const TUNINGS: TuningPreset[] = [
  { id: "standard", label: "Standard",  short: "G C E A", strings: [
    { name: "G", freq: 392.0,  octave: 4 },
    { name: "C", freq: 261.63, octave: 4 },
    { name: "E", freq: 329.63, octave: 4 },
    { name: "A", freq: 440.0,  octave: 4 },
  ]},
  { id: "lowg", label: "Low G", short: "G C E A", strings: [
    { name: "G", freq: 196.0,  octave: 3 },
    { name: "C", freq: 261.63, octave: 4 },
    { name: "E", freq: 329.63, octave: 4 },
    { name: "A", freq: 440.0,  octave: 4 },
  ]},
  { id: "d", label: "D Tuning", short: "A D F# B", strings: [
    { name: "A",  freq: 440.0,  octave: 4 },
    { name: "D",  freq: 293.66, octave: 4 },
    { name: "F#", freq: 369.99, octave: 4 },
    { name: "B",  freq: 493.88, octave: 4 },
  ]},
  { id: "baritone", label: "Baritone", short: "D G B E", strings: [
    { name: "D", freq: 293.66, octave: 4 },
    { name: "G", freq: 392.0,  octave: 4 },
    { name: "B", freq: 493.88, octave: 4 },
    { name: "E", freq: 659.25, octave: 5 },
  ]},
]

const TUNING_KEY  = "ukepocket_tuning"
const METER_RANGE = 30   // ±30 cents full-scale

// ── Backend tuning constants ───────────────────────────────────────────────────
// IN_TUNE_HZ: absolute Hz tolerance for "In Tune" — ±1 Hz as specified.
// At A4 (440 Hz) that's ≈ 3.9 cents; at C4 (261 Hz) it's ≈ 6.6 cents.
const IN_TUNE_HZ    = 1.0   // ±1 Hz "in tune" window

// MPM produces higher-quality readings than the old YIN, so we can afford
// a stricter clarity floor and a faster blend for a snappier needle.
const CLARITY_MIN   = 0.45  // raised from 0.40 — fewer false readings from MPM
const SMOOTHER_FAST = 0.55  // raised from 0.45 — MPM is less noisy → faster response

type TuneStatus = "idle" | "listening" | "flat" | "sharp" | "intune"

// ── Layout constants ──────────────────────────────────────────────────────────
// viewBox "0 0 200 340":
//   Pegs are still at cy = 52 (top) and cy = 142 (bottom) — unchanged.
//   HS_W reduced from 220 → 194 so that HS_H = 194*(340/200) ≈ 330 px,
//   keeping the rendered height identical and avoiding any page scroll.
//   The extra 40 viewBox units at the bottom go entirely to the longer fretboard.
//
//   TOP_PEG_Y = 330 * 52/340 ≈ 50 px
//   BOT_PEG_Y = 330 * 142/340 ≈ 138 px
//   TOP_PAD   = 50 − 26 = 24 px
//   BTN_GAP   = 138 − 50 − 52 = 36 px

const HS_W       = 194
const VIEWBOX_H  = 340
const VIEWBOX_W  = 200
const PEG_TOP_VB = 52
const PEG_BOT_VB = 142
const HS_H       = HS_W * VIEWBOX_H / VIEWBOX_W         // ≈ 330
const TOP_PEG_Y  = HS_H * PEG_TOP_VB / VIEWBOX_H       // ≈ 50
const BOT_PEG_Y  = HS_H * PEG_BOT_VB / VIEWBOX_H       // ≈ 138
const BTN_HALF   = 26
const TOP_PAD    = Math.max(0, TOP_PEG_Y - BTN_HALF)   // ≈ 24
const BTN_GAP    = BOT_PEG_Y - TOP_PEG_Y - 52          // ≈ 36

// ── Headstock SVG ─────────────────────────────────────────────────────────────
const PEG_KNOB = [
  { cx: 16,  cy: 142 }, // G — bottom-left
  { cx: 16,  cy: 52  }, // C — top-left
  { cx: 184, cy: 52  }, // E — top-right
  { cx: 184, cy: 142 }, // A — bottom-right
]
const STRING_POST = [
  { cx: 56,  cy: 142 },
  { cx: 56,  cy: 52  },
  { cx: 144, cy: 52  },
  { cx: 144, cy: 142 },
]
// Evenly distribute 4 strings across the slimmer 100px neck (x: 50 -> 150).
const NUT_X = [68, 89.33, 110.67, 132]
const STRING_PATHS = [
  `M ${NUT_X[0]},177 Q 40,162 16,142`,
  `M ${NUT_X[1]},177 Q 52,115 16,52`,
  `M ${NUT_X[2]},177 Q 148,115 184,52`,
  `M ${NUT_X[3]},177 Q 160,162 184,142`,
]
const FRET_Y = [210, 252, 295]   // re-spaced for the taller 177→340 fretboard

interface HeadstockProps {
  selectedString: number | null  // user-tapped string
  autoString:     number | null  // auto-detected closest string
  inTune:         boolean
  isListening:    boolean
}

function MinimalHeadstock({ selectedString, autoString, inTune, isListening }: HeadstockProps) {
  // Active peg = user-selected (if any) else auto-detected
  const activeIdx = selectedString ?? autoString

  function stringColor(i: number) {
    // 100% solid — strings punch through the transparent fretboard in both themes
    if (i !== activeIdx) return "rgb(110,108,105)"
    return inTune && isListening ? "#34C759" : "var(--primary)"
  }
  function sw(i: number) { return i === activeIdx ? 2 : 1.4 }
  function knobFill(i: number) {
    if (i !== activeIdx) return "var(--card)"
    return inTune && isListening ? "#34C759" : "var(--primary)"
  }
  function knobStroke(i: number) {
    return i !== activeIdx ? "#C7C7CC"
      : inTune && isListening ? "#34C759" : "var(--primary)"
  }
  function gripColor(i: number) {
    return i === activeIdx ? "rgba(255,255,255,0.35)" : "#E0E0E3"
  }
  function dotFill(i: number) {
    return i === activeIdx ? "rgba(255,255,255,0.7)" : "#C7C7CC"
  }

  return (
    <svg viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`} width={HS_W} height={HS_H}
      aria-hidden style={{ display: "block", flexShrink: 0 }}>

      {/* Headstock body — stroke uses a mid-gray that reads in both light & dark */}
      <rect x={36} y={8} width={128} height={162} rx={20}
        fill="var(--card)" stroke="rgba(160,160,170,0.6)" strokeWidth={1.8} />

      {/* Left shafts */}
      <rect x={16} y={46} width={24} height={12} rx={3} fill="rgba(200,200,210,0.7)" />
      <rect x={16} y={136} width={24} height={12} rx={3} fill="rgba(200,200,210,0.7)" />
      {/* Right shafts */}
      <rect x={160} y={46} width={24} height={12} rx={3} fill="rgba(200,200,210,0.7)" />
      <rect x={160} y={136} width={24} height={12} rx={3} fill="rgba(200,200,210,0.7)" />

      {/* String post holes */}
      {STRING_POST.map(({ cx, cy }, i) => (
        <g key={`post-${i}`}>
          <circle cx={cx} cy={cy} r={7} fill="none" stroke="rgba(160,160,170,0.6)" strokeWidth={1.2} />
          <circle cx={cx} cy={cy} r={2.5} fill="rgba(160,160,170,0.7)" />
        </g>
      ))}

      {/* Tuning machine lever keys */}
      {PEG_KNOB.map(({ cx, cy }, i) => (
        <g key={`knob-${i}`} style={{ transition: "all 0.25s ease" }}>
          <circle cx={cx} cy={cy} r={14}
            fill={knobFill(i)} stroke={knobStroke(i)} strokeWidth={1.6}
            style={{ transition: "fill 0.25s ease, stroke 0.25s ease" }} />
          <line x1={cx} y1={cy - 10} x2={cx} y2={cy + 10}
            stroke={gripColor(i)} strokeWidth={1.4} style={{ transition: "stroke 0.25s ease" }} />
          <line x1={cx - 10} y1={cy} x2={cx + 10} y2={cy}
            stroke={gripColor(i)} strokeWidth={1.4} style={{ transition: "stroke 0.25s ease" }} />
          <circle cx={cx} cy={cy} r={3.5}
            fill={dotFill(i)} style={{ transition: "fill 0.25s ease" }} />
        </g>
      ))}

      {/* String curves from nut to peg */}
      {STRING_PATHS.map((d, i) => (
        <path key={i} d={d}
          stroke={stringColor(i)} strokeWidth={sw(i)}
          fill="none" strokeLinecap="round"
          style={{ transition: "stroke 0.25s ease" }} />
      ))}

      {/* Nut */}
      <rect x={34} y={170} width={132} height={7} rx={2} fill="rgba(180,175,165,0.85)" />

      {/* Fretboard / neck body
           Fill: low-opacity so the page background shows through (transparent look).
           Stroke: fully opaque — clearly the neck outline, distinct from strings.
           Strings are drawn after this rect (on top) so they appear 100% solid
           regardless of the fill opacity, in both light and dark themes. */}
      <rect x={50} y={177} width={100} height={160} rx={4}
        fill="rgba(200,198,195,0.22)"
        stroke="rgba(118,116,114,0.92)"
        strokeWidth={2} />

      {/* Fret lines — warm light grey, thinner than outline, distinct from strings */}
      {FRET_Y.map((y) => (
        <line key={y} x1={50} y1={y} x2={150} y2={y}
          stroke="rgba(168,166,163,0.60)" strokeWidth={1.2} />
      ))}

      {/* Fretboard strings — extend to new viewBox bottom */}
      {NUT_X.map((x, i) => (
        <line key={i} x1={x} y1={177} x2={x} y2={340}
          stroke={stringColor(i)} strokeWidth={sw(i)} strokeLinecap="round"
          style={{ transition: "stroke 0.25s ease" }} />
      ))}

      {/* In-tune pulse on fretboard */}
      {activeIdx !== null && inTune && isListening && (
        <line
          x1={NUT_X[activeIdx!]} y1={177} x2={NUT_X[activeIdx!]} y2={340}
          stroke="#34C759" strokeWidth={3.5} strokeLinecap="round" opacity={0}
          style={{ animation: "stringPulse 1.6s ease-in-out infinite" }}
        />
      )}
    </svg>
  )
}

// ── String button ─────────────────────────────────────────────────────────────
interface StringBtnProps {
  name: string; isSelected: boolean; isAuto: boolean
  inTune: boolean; isListening: boolean
  onClick: () => void
}

function StringBtn({ name, isSelected, isAuto, inTune, isListening, onClick }: StringBtnProps) {
  const showGreen   = (isSelected || isAuto) && inTune && isListening
  const isHighlight = isSelected || isAuto
  return (
    <button
      onClick={onClick}
      aria-label={`${name} string`}
      aria-pressed={isSelected}
      style={{
        width:          52, height: 52, borderRadius: "50%",
        border:         "none", cursor: "pointer",
        display:        "flex", alignItems: "center", justifyContent: "center",
        flexShrink:     0,
        background:     isSelected
          ? (showGreen ? "#34C759" : "var(--primary)")
          : isAuto
            ? (showGreen ? "rgba(52,199,89,0.15)" : "rgba(0,122,255,0.1)")
            : "var(--card)",
        boxShadow:      isHighlight
          ? `0 0 0 2px ${showGreen ? "#34C759" : "var(--primary)"}`
          : "0 0 0 1px rgba(60,60,67,0.14), 0 2px 6px rgba(0,0,0,0.07)",
        transition:     "background 0.22s ease, box-shadow 0.22s ease",
      }}
      onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.9)"; e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerUp={(e)     => { (e.currentTarget as HTMLElement).style.transform = "scale(1)" }}
      onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)" }}
    >
      <span style={{
        fontSize: 19, fontWeight: 600, letterSpacing: "-0.5px",
        color:    isSelected ? "#FFFFFF" : isAuto ? "var(--primary)" : "var(--foreground)",
        transition: "color 0.2s ease", pointerEvents: "none",
      }}>
        {name}
      </span>
    </button>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: TuneStatus }) {
  const cfg = {
    idle:      { text: "Tap button and pluck your string", color: "var(--text-tertiary)" },
    listening: { text: "Start playing",                     color: "var(--text-tertiary)" },
    flat:      { text: "Tune higher",                       color: "var(--destructive)"   },
    sharp:     { text: "Tune lower",                        color: "var(--warning)"       },
    intune:    { text: "Tuned",                             color: "var(--success)"       },
  }[status]
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, minHeight: 22 }}>
      {status === "intune" && <Check size={14} strokeWidth={2.5} style={{ color: "var(--success)" }} />}
      <span style={{
        fontSize: 15, fontWeight: status === "intune" ? 600 : 400,
        color: cfg.color, transition: "color 0.3s ease",
      }}>
        {cfg.text}
      </span>
    </div>
  )
}

// ── Tuning preset picker ──────────────────────────────────────────────────────
function TuningPicker({ current, options, onChange }: {
  current: TuningPreset; options: TuningPreset[]; onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Change tuning"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "7px 16px", borderRadius: 100, background: "var(--card)",
          boxShadow: "0 0 0 1px rgba(60,60,67,0.14), 0 1px 4px rgba(0,0,0,0.05)",
          border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500,
          letterSpacing: "-0.1px", color: "var(--foreground)",
        }}
      >
        <span>{current.label}</span>
        <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>({current.short})</span>
        <ChevronDown size={14} strokeWidth={2}
          style={{ color: "var(--text-tertiary)", transition: "transform 0.2s ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", top: "calc(100% + 8px)", zIndex: 50,
            background: "var(--card)", borderRadius: 14,
            boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)",
            overflow: "hidden", minWidth: 200, animation: "sheetUp 0.18s ease",
          }}>
            {options.map((t) => (
              <button key={t.id} onClick={() => { onChange(t.id); setOpen(false) }}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  padding: "12px 16px", border: "none",
                  borderBottom: "1px solid var(--separator)",
                  background: t.id === current.id ? "rgba(0,122,255,0.06)" : "transparent",
                  cursor: "pointer", gap: 10, fontFamily: "inherit", textAlign: "left",
                }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 15, fontWeight: 500, color: "var(--foreground)", margin: 0 }}>{t.label}</p>
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0, marginTop: 2 }}>{t.short}</p>
                </div>
                {t.id === current.id && <Check size={15} strokeWidth={2.5} style={{ color: "var(--primary)", flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Horizontal tuning meter ───────────────────────────────────────────────────
interface MeterProps { detuneHz: number; isActive: boolean; inTune: boolean }

function HorizontalMeter({ detuneHz, isActive, inTune }: MeterProps) {
  const W = 300, H = 72, cx = W / 2
  const arcLeft = 16
  const arcRight = W - 16
  const arcBaseY = 56
  const arcPeakY = 22
  const pivotY = 60
  const sweepDeg = 60 // total sweep: -30° (flat) to +30° (sharp)
  // Drive needle by absolute frequency delta so movement reflects real Hz difference.
  // Negative (flat): tighten. Positive (sharp): loosen.
  const NEEDLE_HZ_RANGE = 12 // ±12 Hz fills full sweep
  const hzClamped = Math.max(-NEEDLE_HZ_RANGE, Math.min(NEEDLE_HZ_RANGE, detuneHz))
  const needleDeg = isActive
    ? (hzClamped / NEEDLE_HZ_RANGE) * (sweepDeg / 2)
    : 2 // idle: almost zero, slight right bias
  // ±5 cents visual zone (meter display only — in-tune detection uses ±1 Hz)
  const ZONE_CENTS = 5
  const zoneHW  = (ZONE_CENTS / METER_RANGE) * cx

  const arcY = (x: number) => {
    const half = (arcRight - arcLeft) / 2
    const norm = (x - cx) / half
    return arcBaseY - (arcBaseY - arcPeakY) * (1 - norm * norm)
  }

  const ticks   = Array.from({ length: 13 }, (_, i) => {
    const c = -30 + i * 5; const major = c % 10 === 0
    const x = cx + (c / METER_RANGE) * (cx - arcLeft)
    const y2 = arcY(x)
    const y1 = y2 - (major ? 10 : 6)
    const ly = y1 - 5
    return { x, y1, y2, major, c, ly }
  })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }} aria-hidden>
      <path d={`M ${arcLeft},${arcBaseY} Q ${cx},${arcPeakY} ${arcRight},${arcBaseY}`}
        fill="none" stroke="var(--text-tertiary)" strokeWidth={1.3} opacity={0.42} />
      {ticks.map(({ x, y1, y2, major, c }) => (
        <line key={c} x1={x} y1={y1} x2={x} y2={y2}
          stroke="var(--text-tertiary)"
          opacity={major ? 0.58 : 0.32}
          strokeWidth={major ? 1.2 : 0.7} />
      ))}
      {/* Subtle arc numbers (major only) */}
      {ticks
        .filter(({ major, c }) => major && c !== 0)
        .map(({ x, ly, c }) => (
          <text
            key={`lbl-${c}`}
            x={x}
            y={ly}
            textAnchor="middle"
            fontSize={9}
            fontWeight={600}
            letterSpacing={0.1}
            fill="var(--text-tertiary)"
            opacity={0.6}
            style={{ userSelect: "none" }}
          >
            {c > 0 ? `+${c}` : `${c}`}
          </text>
        ))}
      {/* In-tune zone wedge for arc meter */}
      <path d={`M ${cx - zoneHW},${arcPeakY} L ${cx + zoneHW},${arcPeakY} L ${cx},${pivotY - 6} Z`}
        fill={inTune ? "rgba(52,199,89,0.22)" : "rgba(52,199,89,0.10)"}
        style={{ transition: "fill 0.4s ease" }} />
      <path d={`M ${cx - zoneHW},${arcPeakY} L ${cx + zoneHW},${arcPeakY} L ${cx},${pivotY - 6} Z`}
        fill="none" stroke={inTune ? "rgba(52,199,89,0.55)" : "rgba(52,199,89,0.22)"} strokeWidth={0.8}
        style={{ transition: "stroke 0.4s ease" }} />
      {/* Speedometer-style needle:
          fixed pivot at center, only rotation changes */}
      <g
        style={{
          transformOrigin: `${cx}px ${pivotY}px`,
          transform: `rotate(${needleDeg}deg)`,
          transition: "transform 120ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <line
          x1={cx}
          y1={pivotY}
          x2={cx}
          y2={arcPeakY - 2}
          stroke={isActive ? (inTune ? "#34C759" : "var(--primary)") : "rgba(60,60,67,0.35)"}
          strokeWidth={2}
          strokeLinecap="round"
          style={{ transition: "stroke 0.3s ease" }}
        />
      </g>
      <circle
        cx={cx}
        cy={pivotY}
        r={3.5}
        fill={isActive ? (inTune ? "#34C759" : "var(--primary)") : "rgba(60,60,67,0.35)"}
        style={{ transition: "fill 0.3s ease" }}
      />
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function ReferenceTuner() {
  const [tuningId,        setTuningId]        = useState<string>(() => {
    try { return localStorage.getItem(TUNING_KEY) ?? "standard" } catch { return "standard" }
  })
  // User's explicitly selected string (tap on a button)
  const [selectedString,  setSelectedString]  = useState<number | null>(null)
  // Auto-detected closest string (from mic)
  const [autoString,      setAutoString]      = useState<number | null>(null)
  const [detectedFreq,    setDetectedFreq]    = useState<number | null>(null)
  const [isListening,     setIsListening]     = useState(false)
  const [hasStarted,      setHasStarted]      = useState(false)  // true once mic started
  const [micError,        setMicError]        = useState(false)

  // Exponential moving average for frequency smoothing
  const freqEMA = useRef(0)

  const tuning  = TUNINGS.find((t) => t.id === tuningId) ?? TUNINGS[0]
  const s       = tuning.strings

  useEffect(() => { localStorage.setItem(TUNING_KEY, tuningId) }, [tuningId])

  // ── Start pitch detection ── must be called from a user gesture ──────
  const startListening = useCallback(async () => {
    if (hasStarted) return
    setMicError(false)
    try {
      await startPitchDetection((result: PitchDetectionResult) => {
        if (result.frequency && result.clarity >= CLARITY_MIN) {
          // Fast EMA: 55% new reading → snappy needle
          freqEMA.current = freqEMA.current === 0
            ? result.frequency
            : freqEMA.current * (1 - SMOOTHER_FAST) + result.frequency * SMOOTHER_FAST

          setDetectedFreq(freqEMA.current)

          // Auto-detect closest string
          setAutoString((prev) => {
            const idx = tuning.strings.reduce((bestIdx, cand, i) =>
              Math.abs(centsDifference(freqEMA.current, cand.freq)) <
              Math.abs(centsDifference(freqEMA.current, tuning.strings[bestIdx].freq))
                ? i : bestIdx,
              0)
            return idx !== prev ? idx : prev
          })
        } else {
          // Signal dropped: fade out gracefully after a short hold
          setDetectedFreq(null)
          freqEMA.current = 0
        }
      })
      setIsListening(true)
      setHasStarted(true)
    } catch {
      setMicError(true)
      setIsListening(false)
    }
  }, [hasStarted, tuning])

  // Stop everything on unmount or tuning change
  useEffect(() => {
    return () => { stopPitchDetection(); stopString() }
  }, [])

  useEffect(() => {
    stopString()
    setSelectedString(null)
    setAutoString(null)
    setDetectedFreq(null)
    freqEMA.current = 0
  }, [tuningId])

  // ── String button handler — also starts mic on first tap ─────────────
  const handleStringPress = useCallback(async (index: number) => {
    haptic(10)
    playString(s[index].freq, 2.6)
    setSelectedString((prev) => (prev === index ? null : index))
    // iOS: AudioContext must be started from a user gesture → do it here
    if (!hasStarted) await startListening()
  }, [s, hasStarted, startListening])

  // ── Derived tuning values ─────────────────────────────────────────────
  // Active string: user-selected takes priority, fallback to auto-detected
  const activeStringIdx = selectedString ?? autoString
  const targetString    = activeStringIdx !== null ? s[activeStringIdx] : null
  const targetFreq      = targetString?.freq ?? null
  const cents           = detectedFreq && targetFreq ? centsDifference(detectedFreq, targetFreq) : 0
  const detuneHz        = detectedFreq && targetFreq ? detectedFreq - targetFreq : 0
  // ±1 Hz absolute frequency check — more musically meaningful than a fixed cents value
  const inTune          = Boolean(detectedFreq && targetFreq && Math.abs(detectedFreq - targetFreq) <= IN_TUNE_HZ)

  const status: TuneStatus =
    micError                       ? "idle"      :
    !hasStarted                    ? "idle"      :
    !detectedFreq                  ? "listening" :
    inTune                         ? "intune"    :
    cents < 0                      ? "flat"      :
                                     "sharp"

  const hzDisplay = detectedFreq ? `${detectedFreq.toFixed(1)} Hz` : "0.0 Hz"

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--background)", overflow: "hidden" }}>

      {/* ── Tuning preset ── */}
      <div style={{ padding: "14px 20px 0", flexShrink: 0 }}>
        <TuningPicker current={tuning} options={TUNINGS} onChange={setTuningId} />
      </div>

      {/* ── Note display ── */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 20px 0", flexShrink: 0 }}>
        <div style={{
          fontSize: 46, fontWeight: 700, letterSpacing: "-1.0px", lineHeight: 1,
          color: detectedFreq
            ? (inTune && isListening ? "var(--success)" : "var(--foreground)")
            : "var(--text-tertiary)",
          opacity: detectedFreq ? 1 : 0.72,
          transition: "color 0.4s ease", fontVariantNumeric: "tabular-nums",
          minHeight: 54, display: "flex", alignItems: "center",
        }}>
          {hzDisplay}
        </div>
        <div style={{ marginTop: 4 }}>
          <StatusBadge status={status} />
        </div>
      </div>

      {/* ── Horizontal meter ── */}
      <div style={{ padding: "12px 24px 0", flexShrink: 0 }}>
        <div style={{ textAlign: "center", marginBottom: 6, minHeight: 36 }}>
          <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.6px", lineHeight: 1.05, color: "var(--foreground)", margin: 0 }}>
            {targetString ? `${targetString.name}${targetString.octave}` : "—"}
          </p>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.2px", color: "var(--text-tertiary)", margin: 0, marginTop: 2 }}>
            {targetFreq ? targetFreq.toFixed(1) : "0.0"}
          </p>
        </div>
        <HorizontalMeter
          detuneHz={detuneHz}
          isActive={isListening && detectedFreq !== null}
          inTune={inTune}
        />
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0 14px" }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500 }}>Flat</span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500 }}>Sharp</span>
        </div>
      </div>

      {/* ── Headstock + string buttons ─────────────────────────────────── */}
      <div style={{
        flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center",
        minHeight: 0, padding: "10px 8px 0", gap: 10,
      }}>
        {/* Left column: C (top) G (bottom) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: BTN_GAP, paddingTop: TOP_PAD }}>
          <StringBtn name={s[1].name} isSelected={selectedString === 1} isAuto={selectedString === null && autoString === 1}
            inTune={inTune} isListening={isListening} onClick={() => handleStringPress(1)} />
          <StringBtn name={s[0].name} isSelected={selectedString === 0} isAuto={selectedString === null && autoString === 0}
            inTune={inTune} isListening={isListening} onClick={() => handleStringPress(0)} />
        </div>

        {/* Centre: headstock illustration */}
        <div style={{ flexShrink: 0 }}>
          <MinimalHeadstock
            selectedString={selectedString}
            autoString={autoString}
            inTune={inTune}
            isListening={isListening}
          />
        </div>

        {/* Right column: E (top) A (bottom) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: BTN_GAP, paddingTop: TOP_PAD }}>
          <StringBtn name={s[2].name} isSelected={selectedString === 2} isAuto={selectedString === null && autoString === 2}
            inTune={inTune} isListening={isListening} onClick={() => handleStringPress(2)} />
          <StringBtn name={s[3].name} isSelected={selectedString === 3} isAuto={selectedString === null && autoString === 3}
            inTune={inTune} isListening={isListening} onClick={() => handleStringPress(3)} />
        </div>
      </div>

      {/* ── Mic error banner ── */}
      {micError && (
        <div style={{ padding: "0 16px calc(var(--safe-bottom) + 10px)", flexShrink: 0 }}>
          <div style={{
            background: "rgba(255,59,48,0.08)", borderRadius: 12, padding: "12px 14px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Mic size={18} strokeWidth={1.5} style={{ color: "var(--destructive)", flexShrink: 0 }} />
              <p style={{ fontSize: 14, fontWeight: 500, color: "var(--destructive)", margin: 0 }}>
                Microphone access required
              </p>
            </div>
            <button onClick={startListening} style={{
              background: "var(--destructive)", color: "#FFFFFF", border: "none",
              borderRadius: 8, padding: "5px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
            }}>Allow</button>
          </div>
        </div>
      )}


      <style>{`
        @keyframes stringPulse {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 0.1; }
        }
      `}</style>
    </div>
  )
}
