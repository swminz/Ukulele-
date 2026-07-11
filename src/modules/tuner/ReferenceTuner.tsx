import { useState, useEffect, useCallback, useRef } from "react"
import { playString, stopString, haptic } from "@/lib/audio"
import {
  startPitchDetection,
  stopPitchDetection,
  centsDifference,
  frequencyToNote,
  type PitchDetectionResult,
} from "@/lib/pitch"
import { ChevronDown, Check, Mic, AudioLines } from "lucide-react"

// ── Tunings ──────────────────────────────────────────────────────────────────
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
const METER_RANGE = 30
const ZONE_CENTS  = 5

type TuneStatus = "idle" | "listening" | "flat" | "sharp" | "intune"

// ── Layout constants ──────────────────────────────────────────────────────────
// Headstock SVG is rendered at a fixed width so button positions can be
// computed precisely from the viewBox coordinates.
//
// viewBox: "0 0 200 300"
// Peg key centres (in viewBox units):
//   TOP pegs (C / E): cy = 52
//   BOT pegs (G / A): cy = 142
//
// At HS_W=170 px → HS_H = 170 * (300/200) = 255 px
// TOP_PEG_Y = 255 * (52/300) ≈ 44 px
// BOT_PEG_Y = 255 * (142/300) ≈ 120 px
// btn_half   = 52 / 2 = 26 px
// TOP_PAD    = 44 - 26 = 18 px   (paddingTop on the button column)
// BTN_GAP    = 120 - 44 - 52 = 24 px  (gap between C and G buttons)

const HS_W       = 170
const VIEWBOX_H  = 300
const VIEWBOX_W  = 200
const PEG_TOP_VB = 52         // cy of C / E pegs in the viewBox
const PEG_BOT_VB = 142        // cy of G / A pegs in the viewBox
const HS_H       = HS_W * VIEWBOX_H / VIEWBOX_W         // 255
const TOP_PEG_Y  = HS_H * PEG_TOP_VB / VIEWBOX_H       // ≈ 44
const BOT_PEG_Y  = HS_H * PEG_BOT_VB / VIEWBOX_H       // ≈ 120
const BTN_HALF   = 26
const TOP_PAD    = Math.max(0, TOP_PEG_Y - BTN_HALF)   // ≈ 18
const BTN_GAP    = BOT_PEG_Y - TOP_PEG_Y - 52          // ≈ 24

// ── Headstock SVG ─────────────────────────────────────────────────────────────
//
// Tuning machine "lever key" design per peg:
//   • String-post hole visible on the headstock FACE (small circle + centre dot)
//   • Shaft   — horizontal bar connecting headstock edge to the knob
//   • Knob    — the grippable lever key circle drawn with a cross-grip pattern
//   • Centre dot — small filled circle in the knob
//
// Peg positions in viewBox "0 0 200 300":
//   Left  side: cx = 16   (shaft from x=16 to x=38, overlapping headstock edge at x=36)
//   Right side: cx = 184  (shaft from x=162 to x=184)
//   Top   row:  cy = 52   (C left / E right)
//   Bottom row: cy = 142  (G left / A right)
//
// String post holes on headstock face:
//   Left posts:  cx = 56  (C cy=52, G cy=142)
//   Right posts: cx = 144 (E cy=52, A cy=142)
//
// Nut at y=170, fretboard to y=300.
// String x at nut: 78, 91, 109, 122.

const PEG_KNOB = [
  { cx: 16,  cy: 142 }, // G — bottom-left
  { cx: 16,  cy: 52  }, // C — top-left
  { cx: 184, cy: 52  }, // E — top-right
  { cx: 184, cy: 142 }, // A — bottom-right
]
const STRING_POST = [
  { cx: 56,  cy: 142 }, // G
  { cx: 56,  cy: 52  }, // C
  { cx: 144, cy: 52  }, // E
  { cx: 144, cy: 142 }, // A
]
const NUT_X = [78, 91, 109, 122]
const STRING_PATHS = [
  `M ${NUT_X[0]},177 Q 40,162 16,142`,   // G
  `M ${NUT_X[1]},177 Q 52,115 16,52`,    // C
  `M ${NUT_X[2]},177 Q 148,115 184,52`,  // E
  `M ${NUT_X[3]},177 Q 160,162 184,142`, // A
]
const FRET_Y = [206, 237, 268]

interface HeadstockProps {
  selectedString: number | null
  inTune: boolean
  isListening: boolean
}

function MinimalHeadstock({ selectedString, inTune, isListening }: HeadstockProps) {
  function active(i: number) { return selectedString === i }
  function stringColor(i: number) {
    if (!active(i)) return "rgba(60,60,67,0.2)"
    return inTune && isListening ? "#34C759" : "var(--primary)"
  }
  function sw(i: number) { return active(i) ? 2 : 1.4 }
  function knobFill(i: number) {
    if (!active(i)) return "var(--card)"
    return inTune && isListening ? "#34C759" : "var(--primary)"
  }
  function knobStroke(i: number) {
    if (!active(i)) return "#C7C7CC"
    return inTune && isListening ? "#34C759" : "var(--primary)"
  }
  function gripColor(i: number) {
    return active(i) ? "rgba(255,255,255,0.35)" : "#E0E0E3"
  }
  function dotFill(i: number) {
    return active(i) ? "rgba(255,255,255,0.7)" : "#C7C7CC"
  }

  return (
    <svg
      viewBox="0 0 200 300"
      width={HS_W}
      height={HS_H}
      aria-hidden
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* ── Headstock body ──────────────────────────────────────────── */}
      <rect x={36} y={8} width={128} height={162} rx={20}
        fill="var(--card)" stroke="#D1D1D6" strokeWidth={1.5} />

      {/* ── Left peg shafts ─────────────────────────────────────────── */}
      <rect x={16} y={46} width={24} height={12} rx={3} fill="#E5E7EB" />
      <rect x={16} y={136} width={24} height={12} rx={3} fill="#E5E7EB" />

      {/* ── Right peg shafts ────────────────────────────────────────── */}
      <rect x={160} y={46} width={24} height={12} rx={3} fill="#E5E7EB" />
      <rect x={160} y={136} width={24} height={12} rx={3} fill="#E5E7EB" />

      {/* ── String post holes on headstock face ─────────────────────── */}
      {STRING_POST.map(({ cx, cy }, i) => (
        <g key={`post-${i}`}>
          <circle cx={cx} cy={cy} r={7} fill="none" stroke="#D1D1D6" strokeWidth={1.2} />
          <circle cx={cx} cy={cy} r={2.5} fill="#D1D1D6" />
        </g>
      ))}

      {/* ── Tuning machine lever keys (knobs) ───────────────────────── */}
      {/* Draw these BELOW strings so strings sit on top */}
      {PEG_KNOB.map(({ cx, cy }, i) => (
        <g key={`knob-${i}`} style={{ transition: "all 0.3s ease" }}>
          {/* Outer knob circle */}
          <circle cx={cx} cy={cy} r={14}
            fill={knobFill(i)} stroke={knobStroke(i)} strokeWidth={1.6}
            style={{ transition: "fill 0.3s ease, stroke 0.3s ease" }}
          />
          {/* Cross grip pattern */}
          <line x1={cx} y1={cy - 10} x2={cx} y2={cy + 10}
            stroke={gripColor(i)} strokeWidth={1.4} style={{ transition: "stroke 0.3s ease" }} />
          <line x1={cx - 10} y1={cy} x2={cx + 10} y2={cy}
            stroke={gripColor(i)} strokeWidth={1.4} style={{ transition: "stroke 0.3s ease" }} />
          {/* Knob centre dot */}
          <circle cx={cx} cy={cy} r={3.5}
            fill={dotFill(i)} style={{ transition: "fill 0.3s ease" }} />
        </g>
      ))}

      {/* ── String curves from nut to each knob ─────────────────────── */}
      {STRING_PATHS.map((d, i) => (
        <path key={i} d={d}
          stroke={stringColor(i)} strokeWidth={sw(i)}
          fill="none" strokeLinecap="round"
          style={{ transition: "stroke 0.3s ease" }}
        />
      ))}

      {/* ── Nut ────────────────────────────────────────────────────── */}
      <rect x={34} y={170} width={132} height={7} rx={2} fill="#C7C7CC" />

      {/* ── Fret lines ──────────────────────────────────────────────── */}
      {FRET_Y.map((y) => (
        <line key={y} x1={55} y1={y} x2={145} y2={y} stroke="#E5E7EB" strokeWidth={1.2} />
      ))}

      {/* ── Strings on fretboard ────────────────────────────────────── */}
      {NUT_X.map((x, i) => (
        <line key={i} x1={x} y1={177} x2={x} y2={300}
          stroke={stringColor(i)} strokeWidth={sw(i)} strokeLinecap="round"
          style={{ transition: "stroke 0.3s ease" }}
        />
      ))}

      {/* In-tune pulse overlay */}
      {selectedString !== null && inTune && isListening && (
        <line
          x1={NUT_X[selectedString]} y1={177}
          x2={NUT_X[selectedString]} y2={300}
          stroke="#34C759" strokeWidth={3.5} strokeLinecap="round"
          opacity={0}
          style={{ animation: "stringPulse 1.6s ease-in-out infinite" }}
        />
      )}
    </svg>
  )
}

// ── String button ─────────────────────────────────────────────────────────────
interface StringBtnProps {
  name: string
  isSelected: boolean
  inTune: boolean
  isListening: boolean
  onClick: () => void
}

function StringBtn({ name, isSelected, inTune, isListening, onClick }: StringBtnProps) {
  const showGreen = isSelected && inTune && isListening
  return (
    <button
      onClick={onClick}
      aria-label={`${name} string`}
      aria-pressed={isSelected}
      style={{
        width:           52,
        height:          52,
        borderRadius:    "50%",
        border:          "none",
        cursor:          "pointer",
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        flexShrink:      0,
        background:      isSelected
          ? (showGreen ? "#34C759" : "var(--primary)")
          : "var(--card)",
        boxShadow:       isSelected
          ? `0 0 0 2px ${showGreen ? "#34C759" : "var(--primary)"}`
          : "0 0 0 1px rgba(60,60,67,0.14), 0 2px 6px rgba(0,0,0,0.07)",
        transition:      "background 0.22s ease, box-shadow 0.22s ease",
      }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(0.9)"
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerUp={(e)     => { (e.currentTarget as HTMLElement).style.transform = "scale(1)" }}
      onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)" }}
    >
      <span
        style={{
          fontSize:      19,
          fontWeight:    600,
          letterSpacing: "-0.5px",
          color:         isSelected ? "#FFFFFF" : "var(--foreground)",
          transition:    "color 0.2s ease",
          pointerEvents: "none",
        }}
      >
        {name}
      </span>
    </button>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: TuneStatus }) {
  const cfg = {
    idle:      { text: "Select a string", color: "var(--text-tertiary)" },
    listening: { text: "Listening…",      color: "var(--text-tertiary)" },
    flat:      { text: "Too Low",         color: "var(--destructive)"   },
    sharp:     { text: "Too High",        color: "var(--warning)"       },
    intune:    { text: "In Tune",         color: "var(--success)"       },
  }[status]
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, minHeight: 22 }}>
      {status === "intune" && <Check size={14} strokeWidth={2.5} style={{ color: "var(--success)" }} />}
      <span style={{ fontSize: 15, fontWeight: status === "intune" ? 600 : 400, color: cfg.color, transition: "color 0.3s ease" }}>
        {cfg.text}
      </span>
    </div>
  )
}

// ── Tuning picker ─────────────────────────────────────────────────────────────
interface TuningPickerProps {
  current: TuningPreset; options: TuningPreset[]; onChange: (id: string) => void
}
function TuningPicker({ current, options, onChange }: TuningPickerProps) {
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
          style={{ color: "var(--text-tertiary)", transition: "transform 0.2s ease", transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />
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
              <button
                key={t.id}
                onClick={() => { onChange(t.id); setOpen(false) }}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  padding: "12px 16px", border: "none",
                  borderBottom: "1px solid var(--separator)",
                  background: t.id === current.id ? "rgba(0,122,255,0.06)" : "transparent",
                  cursor: "pointer", gap: 10, fontFamily: "inherit", textAlign: "left",
                }}
              >
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
interface MeterProps { cents: number; isActive: boolean; inTune: boolean }
function HorizontalMeter({ cents, isActive, inTune }: MeterProps) {
  const W = 300, H = 52, cx = W / 2, trackY = 38, zoneTop = 8
  const clamped = Math.max(-METER_RANGE, Math.min(METER_RANGE, cents))
  const needleX = isActive ? cx + (clamped / METER_RANGE) * cx : cx
  const zoneHW  = (ZONE_CENTS / METER_RANGE) * cx
  const ticks   = Array.from({ length: 13 }, (_, i) => {
    const c = -30 + i * 5; const major = c % 10 === 0
    return { x: cx + (c / METER_RANGE) * cx, major, c }
  })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }} aria-hidden>
      <line x1={16} y1={trackY} x2={W - 16} y2={trackY} stroke="var(--separator)" strokeWidth={1} />
      {ticks.map(({ x, major, c }) => (
        <line key={c} x1={x} y1={trackY - (major ? 14 : 8)} x2={x} y2={trackY}
          stroke={major ? "rgba(60,60,67,0.25)" : "rgba(60,60,67,0.12)"}
          strokeWidth={major ? 1.2 : 0.7} />
      ))}
      <path d={`M ${cx - zoneHW},${zoneTop} L ${cx + zoneHW},${zoneTop} L ${cx},${trackY} Z`}
        fill={inTune ? "rgba(52,199,89,0.22)" : "rgba(52,199,89,0.10)"}
        style={{ transition: "fill 0.4s ease" }} />
      <path d={`M ${cx - zoneHW},${zoneTop} L ${cx + zoneHW},${zoneTop} L ${cx},${trackY} Z`}
        fill="none" stroke={inTune ? "rgba(52,199,89,0.55)" : "rgba(52,199,89,0.22)"} strokeWidth={0.8}
        style={{ transition: "stroke 0.4s ease" }} />
      {isActive && (
        <>
          <line x1={needleX} y1={zoneTop - 2} x2={needleX} y2={trackY + 8}
            stroke="var(--primary)" strokeWidth={2} strokeLinecap="round"
            style={{ transition: "x1 180ms cubic-bezier(0.22,1,0.36,1), x2 180ms cubic-bezier(0.22,1,0.36,1)" }} />
          <circle cx={needleX} cy={trackY + 5} r={3.5} fill="var(--primary)"
            style={{ transition: "cx 180ms cubic-bezier(0.22,1,0.36,1)" }} />
        </>
      )}
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function ReferenceTuner() {
  const [tuningId,       setTuningId]    = useState<string>(() => {
    try { return localStorage.getItem(TUNING_KEY) ?? "standard" } catch { return "standard" }
  })
  const [selectedString, setSelected]   = useState<number | null>(null)
  const [detectedFreq,   setDetectedFreq] = useState<number | null>(null)
  const [isListening,    setIsListening] = useState(false)
  const [micError,       setMicError]   = useState(false)
  const freqSmoother = useRef(0)

  const tuning       = TUNINGS.find((t) => t.id === tuningId) ?? TUNINGS[0]
  const activeString = selectedString !== null ? tuning.strings[selectedString] : null

  useEffect(() => { localStorage.setItem(TUNING_KEY, tuningId) }, [tuningId])

  const handleStringPress = useCallback((index: number) => {
    haptic(10)
    playString(tuning.strings[index].freq, 2.6)
    setSelected((prev) => (prev === index ? null : index))
  }, [tuning])

  const startListening = useCallback(async () => {
    setMicError(false)
    try {
      await startPitchDetection((result: PitchDetectionResult) => {
        if (result.frequency && result.clarity > 0.62) {
          freqSmoother.current = freqSmoother.current === 0
            ? result.frequency
            : freqSmoother.current * 0.78 + result.frequency * 0.22
          setDetectedFreq(freqSmoother.current)
        } else {
          setDetectedFreq(null)
          freqSmoother.current = 0
        }
      })
      setIsListening(true)
    } catch {
      setMicError(true)
      setIsListening(false)
    }
  }, [])

  useEffect(() => {
    startListening()
    return () => { stopPitchDetection(); stopString() }
  }, [startListening])

  useEffect(() => { stopString(); setSelected(null) }, [tuningId])

  const closestString = detectedFreq
    ? tuning.strings.reduce((best, cand) =>
        Math.abs(centsDifference(detectedFreq, cand.freq)) <
        Math.abs(centsDifference(detectedFreq, best.freq)) ? cand : best,
        tuning.strings[0])
    : activeString

  const targetFreq   = closestString?.freq ?? null
  const cents        = detectedFreq && targetFreq ? centsDifference(detectedFreq, targetFreq) : 0
  const inTune       = Boolean(detectedFreq && targetFreq && Math.abs(cents) <= 5)
  const detectedNote = detectedFreq ? frequencyToNote(detectedFreq) : null

  const status: TuneStatus =
    micError                       ? "idle"      :
    selectedString === null        ? "idle"      :
    !isListening || !detectedFreq  ? "listening" :
    inTune                         ? "intune"    :
    cents < -5                     ? "flat"      :
                                     "sharp"

  const displayNote = detectedNote
    ? `${detectedNote.note}${detectedNote.octave}`
    : activeString
      ? `${activeString.name}${activeString.octave}`
      : null

  const s = tuning.strings

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        height:        "100%",
        background:    "var(--background)",
        overflow:      "hidden",
      }}
    >
      {/* ── Tuning preset ── */}
      <div style={{ padding: "14px 20px 0", flexShrink: 0 }}>
        <TuningPicker current={tuning} options={TUNINGS} onChange={setTuningId} />
      </div>

      {/* ── Note display ── */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 20px 2px", flexShrink: 0 }}>
        <div
          style={{
            fontSize:           80,
            fontWeight:         700,
            letterSpacing:      "-3px",
            lineHeight:         1,
            color:              displayNote
              ? (inTune && isListening ? "var(--success)" : "var(--foreground)")
              : "rgba(60,60,67,0.18)",
            transition:         "color 0.4s ease",
            fontVariantNumeric: "tabular-nums",
            minHeight:          80,
            display:            "flex",
            alignItems:         "center",
          }}
        >
          {displayNote ?? "—"}
        </div>
        <div style={{ marginTop: 4 }}>
          <StatusBadge status={status} />
        </div>
      </div>

      {/* ── Horizontal meter ── */}
      <div style={{ padding: "6px 24px 0", flexShrink: 0 }}>
        <HorizontalMeter cents={cents} isActive={isListening && detectedFreq !== null} inTune={inTune} />
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0 14px" }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500 }}>Flat</span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500 }}>Sharp</span>
        </div>
      </div>

      {/* ── Headstock + string buttons ────────────────────────────────
          Three-column layout: [left buttons] [headstock SVG] [right buttons]
          Buttons are aligned to lever-key positions via TOP_PAD + BTN_GAP
          computed from the fixed SVG dimensions. A visible gap is created
          by the column spacing (gap: 16px on each side).
          ────────────────────────────────────────────────────────────── */}
      <div
        style={{
          flex:            1,
          display:         "flex",
          alignItems:      "flex-start",
          justifyContent:  "center",
          minHeight:       0,
          padding:         "8px 12px 0",
          gap:             16,
        }}
      >
        {/* Left column — C (top) and G (bottom) */}
        <div
          style={{
            display:       "flex",
            flexDirection: "column",
            alignItems:    "center",
            gap:           BTN_GAP,
            paddingTop:    TOP_PAD,
          }}
        >
          <StringBtn
            name={s[1].name}
            isSelected={selectedString === 1}
            inTune={inTune} isListening={isListening}
            onClick={() => handleStringPress(1)}
          />
          <StringBtn
            name={s[0].name}
            isSelected={selectedString === 0}
            inTune={inTune} isListening={isListening}
            onClick={() => handleStringPress(0)}
          />
        </div>

        {/* Centre — fixed-size headstock illustration */}
        <div style={{ flexShrink: 0 }}>
          <MinimalHeadstock
            selectedString={selectedString}
            inTune={inTune}
            isListening={isListening}
          />
        </div>

        {/* Right column — E (top) and A (bottom) */}
        <div
          style={{
            display:       "flex",
            flexDirection: "column",
            alignItems:    "center",
            gap:           BTN_GAP,
            paddingTop:    TOP_PAD,
          }}
        >
          <StringBtn
            name={s[2].name}
            isSelected={selectedString === 2}
            inTune={inTune} isListening={isListening}
            onClick={() => handleStringPress(2)}
          />
          <StringBtn
            name={s[3].name}
            isSelected={selectedString === 3}
            inTune={inTune} isListening={isListening}
            onClick={() => handleStringPress(3)}
          />
        </div>
      </div>

      {/* ── Instruction / mic error card ── */}
      <div style={{ padding: "8px 16px 16px", flexShrink: 0 }}>
        {micError ? (
          <div style={{
            background: "var(--card)", borderRadius: 14, padding: "14px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            boxShadow: "0 1px 8px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.04)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Mic size={20} strokeWidth={1.5} style={{ color: "var(--destructive)" }} />
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>
                  Microphone access required
                </p>
                <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0, marginTop: 1 }}>Tap to try again</p>
              </div>
            </div>
            <button onClick={startListening} style={{
              background: "var(--primary)", color: "#FFFFFF", border: "none",
              borderRadius: 8, padding: "6px 14px", fontSize: 14, fontWeight: 600,
              cursor: "pointer", flexShrink: 0,
            }}>Allow</button>
          </div>
        ) : (
          <div style={{
            background: "var(--card)", borderRadius: 14, padding: "14px 16px",
            display: "flex", alignItems: "center", gap: 14,
            boxShadow: "0 1px 8px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.04)",
          }}>
            <AudioLines size={28} strokeWidth={1.5} style={{
              color: "var(--primary)", flexShrink: 0,
              opacity: isListening ? 1 : 0.4, transition: "opacity 0.3s ease",
            }} />
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>
                {selectedString !== null
                  ? `Pluck the ${s[selectedString].name} string`
                  : "Select a string to begin"}
              </p>
              <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0, marginTop: 1 }}>
                {selectedString !== null ? "Listen closely" : "Tap any button above"}
              </p>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes stringPulse {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 0.1; }
        }
      `}</style>
    </div>
  )
}
