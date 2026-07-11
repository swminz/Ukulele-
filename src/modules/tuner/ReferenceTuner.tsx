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

// ── Horizontal tuning meter ───────────────────────────────────────────────────
// Dense tick marks match the reference image ruler style.
interface MeterProps { cents: number; isActive: boolean; inTune: boolean }

function HorizontalMeter({ cents, isActive, inTune }: MeterProps) {
  const W       = 300
  const H       = 52
  const cx      = W / 2
  const trackY  = 38
  const zoneTop = 8

  const clamped    = Math.max(-METER_RANGE, Math.min(METER_RANGE, cents))
  const needleX    = isActive ? cx + (clamped / METER_RANGE) * cx : cx
  const zoneHalfW  = (ZONE_CENTS / METER_RANGE) * cx   // ≈ 25 px

  // Dense tick marks: every 5 cents (−30 … +30 = 13 marks)
  const ticks = Array.from({ length: 13 }, (_, i) => {
    const c     = -30 + i * 5
    const major = c % 10 === 0
    return { x: cx + (c / METER_RANGE) * cx, major, c }
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }} aria-hidden>
      {/* Track */}
      <line x1={16} y1={trackY} x2={W - 16} y2={trackY} stroke="var(--separator)" strokeWidth={1} />

      {/* Tick marks */}
      {ticks.map(({ x, major, c }) => (
        <line
          key={c}
          x1={x} y1={trackY - (major ? 14 : 8)}
          x2={x} y2={trackY}
          stroke={major ? "rgba(60,60,67,0.25)" : "rgba(60,60,67,0.13)"}
          strokeWidth={major ? 1.2 : 0.7}
        />
      ))}

      {/* Green tolerance zone — apex at track, base at top */}
      <path
        d={`M ${cx - zoneHalfW},${zoneTop} L ${cx + zoneHalfW},${zoneTop} L ${cx},${trackY} Z`}
        fill={inTune ? "rgba(52,199,89,0.22)" : "rgba(52,199,89,0.10)"}
        style={{ transition: "fill 0.4s ease" }}
      />
      <path
        d={`M ${cx - zoneHalfW},${zoneTop} L ${cx + zoneHalfW},${zoneTop} L ${cx},${trackY} Z`}
        fill="none"
        stroke={inTune ? "rgba(52,199,89,0.55)" : "rgba(52,199,89,0.22)"}
        strokeWidth={0.8}
        style={{ transition: "stroke 0.4s ease" }}
      />

      {/* Blue needle */}
      {isActive && (
        <>
          <line
            x1={needleX} y1={zoneTop - 2}
            x2={needleX} y2={trackY + 8}
            stroke="var(--primary)"
            strokeWidth={2}
            strokeLinecap="round"
            style={{ transition: "x1 180ms cubic-bezier(0.22,1,0.36,1), x2 180ms cubic-bezier(0.22,1,0.36,1)" }}
          />
          <circle
            cx={needleX} cy={trackY + 5} r={3.5}
            fill="var(--primary)"
            style={{ transition: "cx 180ms cubic-bezier(0.22,1,0.36,1)" }}
          />
        </>
      )}
    </svg>
  )
}

// ── Headstock SVG (200 × 300 viewBox) ────────────────────────────────────────
//
// Peg centers in viewBox coordinates — used to compute % button positions:
//   C  (top-left):    cx=20, cy=58   → 10.0% / 19.33%
//   G  (bottom-left): cx=20, cy=108  → 10.0% / 36.00%
//   E  (top-right):   cx=180, cy=58  → 90.0% / 19.33%
//   A  (bottom-right):cx=180, cy=108 → 90.0% / 36.00%
//
// String order on nut (left → right): G, C, E, A
// Nut x positions: 80, 94, 106, 120
// Nut y: 162.  Fretboard to y: 300.

const PEG = [
  { cx: 20,  cy: 108 }, // G  — bottom-left
  { cx: 20,  cy: 58  }, // C  — top-left
  { cx: 180, cy: 58  }, // E  — top-right
  { cx: 180, cy: 108 }, // A  — bottom-right
]

const NUT_X = [80, 94, 106, 120]

// Bezier paths from nut-string x to each peg
const STRING_PATHS = [
  `M ${NUT_X[0]},169 Q 42,140 20,108`,   // G
  `M ${NUT_X[1]},169 Q 55,112 20,58`,    // C
  `M ${NUT_X[2]},169 Q 145,112 180,58`,  // E
  `M ${NUT_X[3]},169 Q 158,140 180,108`, // A
]

const FRET_Y = [200, 235, 268]

interface HeadstockProps {
  selectedString: number | null
  inTune: boolean
  isListening: boolean
}

function MinimalHeadstock({ selectedString, inTune, isListening }: HeadstockProps) {
  function stringColor(i: number) {
    if (selectedString !== i) return "rgba(60,60,67,0.18)"
    return inTune && isListening ? "#34C759" : "var(--primary)"
  }
  function sw(i: number) { return selectedString === i ? 2 : 1.4 }
  function pegFill(i: number) {
    if (selectedString !== i) return "var(--card)"
    return inTune && isListening ? "#34C759" : "var(--primary)"
  }
  function pegStroke(i: number) {
    if (selectedString !== i) return "#D1D1D6"
    return inTune && isListening ? "#34C759" : "var(--primary)"
  }

  return (
    <svg
      viewBox="0 0 200 300"
      style={{ width: "100%", display: "block" }}
      aria-hidden
    >
      {/* Headstock body */}
      <rect x={36} y={8} width={128} height={148} rx={20}
        fill="var(--card)" stroke="#D1D1D6" strokeWidth={1.5} />

      {/* Left peg shafts */}
      <rect x={0}   y={52} width={38} height={9} rx={3} fill="#E5E7EB" />
      <rect x={0}   y={102} width={38} height={9} rx={3} fill="#E5E7EB" />
      {/* Right peg shafts */}
      <rect x={162} y={52} width={38} height={9} rx={3} fill="#E5E7EB" />
      <rect x={162} y={102} width={38} height={9} rx={3} fill="#E5E7EB" />

      {/* Peg circles */}
      {PEG.map(({ cx, cy }, i) => (
        <circle key={i} cx={cx} cy={cy} r={13}
          fill={pegFill(i)} stroke={pegStroke(i)} strokeWidth={1.8}
          style={{ transition: "fill 0.3s ease, stroke 0.3s ease" }}
        />
      ))}
      {/* Peg center dots */}
      {PEG.map(({ cx, cy }, i) => (
        <circle key={`d-${i}`} cx={cx} cy={cy} r={3.5}
          fill={selectedString === i ? "rgba(255,255,255,0.72)" : "#C7C7CC"}
          style={{ transition: "fill 0.3s ease" }}
        />
      ))}

      {/* String curves through headstock to pegs */}
      {STRING_PATHS.map((d, i) => (
        <path key={i} d={d}
          stroke={stringColor(i)} strokeWidth={sw(i)}
          fill="none" strokeLinecap="round"
          style={{ transition: "stroke 0.3s ease" }}
        />
      ))}

      {/* Nut */}
      <rect x={34} y={162} width={132} height={7} rx={2} fill="#C7C7CC" />

      {/* Fret lines */}
      {FRET_Y.map((y) => (
        <line key={y} x1={58} y1={y} x2={142} y2={y} stroke="#E5E7EB" strokeWidth={1.2} />
      ))}

      {/* Strings on fretboard */}
      {NUT_X.map((x, i) => (
        <line key={i}
          x1={x} y1={169} x2={x} y2={300}
          stroke={stringColor(i)} strokeWidth={sw(i)} strokeLinecap="round"
          style={{ transition: "stroke 0.3s ease" }}
        />
      ))}

      {/* In-tune pulse on active fretboard string */}
      {selectedString !== null && inTune && isListening && (
        <line
          x1={NUT_X[selectedString]} y1={169}
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
  style?: React.CSSProperties
}

function StringBtn({ name, isSelected, inTune, isListening, onClick, style }: StringBtnProps) {
  const showGreen = isSelected && inTune && isListening
  return (
    <button
      onClick={onClick}
      aria-label={`${name} string`}
      aria-pressed={isSelected}
      style={{
        position:        "absolute",
        width:           52,
        height:          52,
        borderRadius:    "50%",
        border:          "none",
        cursor:          "pointer",
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        background:      isSelected
          ? (showGreen ? "#34C759" : "var(--primary)")
          : "var(--card)",
        boxShadow:       isSelected
          ? `0 0 0 2px ${showGreen ? "#34C759" : "var(--primary)"}`
          : "0 0 0 1px rgba(60,60,67,0.14), 0 2px 6px rgba(0,0,0,0.08)",
        transform:       "translate(-50%, -50%)",    // center the button on the % anchor
        transition:      "background 0.22s cubic-bezier(0.22,1,0.36,1), box-shadow 0.22s ease",
        zIndex:          10,
        ...style,
      }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translate(-50%, -50%) scale(0.9)"
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerUp={(e)     => { (e.currentTarget as HTMLElement).style.transform = "translate(-50%, -50%) scale(1)" }}
      onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = "translate(-50%, -50%) scale(1)" }}
    >
      <span
        style={{
          fontSize:     19,
          fontWeight:   600,
          letterSpacing:"-0.5px",
          color:        isSelected ? "#FFFFFF" : "var(--foreground)",
          transition:   "color 0.2s ease",
          pointerEvents:"none",
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
      {status === "intune" && (
        <Check size={14} strokeWidth={2.5} style={{ color: "var(--success)" }} />
      )}
      <span
        style={{
          fontSize:   15,
          fontWeight: status === "intune" ? 600 : 400,
          color:      cfg.color,
          transition: "color 0.3s ease",
        }}
      >
        {cfg.text}
      </span>
    </div>
  )
}

// ── Tuning picker ─────────────────────────────────────────────────────────────
interface TuningPickerProps {
  current: TuningPreset
  options: TuningPreset[]
  onChange: (id: string) => void
}

function TuningPicker({ current, options, onChange }: TuningPickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Change tuning"
        style={{
          display:       "inline-flex",
          alignItems:    "center",
          gap:           6,
          padding:       "7px 16px",
          borderRadius:  100,
          background:    "var(--card)",
          boxShadow:     "0 0 0 1px rgba(60,60,67,0.14), 0 1px 4px rgba(0,0,0,0.05)",
          border:        "none",
          cursor:        "pointer",
          fontSize:      14,
          fontWeight:    500,
          letterSpacing: "-0.1px",
          color:         "var(--foreground)",
        }}
      >
        <span>{current.label}</span>
        <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>({current.short})</span>
        <ChevronDown
          size={14} strokeWidth={2}
          style={{
            color:      "var(--text-tertiary)",
            transition: "transform 0.2s ease",
            transform:  open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position:   "absolute",
              top:        "calc(100% + 8px)",
              zIndex:     50,
              background: "var(--card)",
              borderRadius: 14,
              boxShadow:  "0 4px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)",
              overflow:   "hidden",
              minWidth:   200,
              animation:  "sheetUp 0.18s ease",
            }}
          >
            {options.map((t) => (
              <button
                key={t.id}
                onClick={() => { onChange(t.id); setOpen(false) }}
                style={{
                  width:        "100%",
                  display:      "flex",
                  alignItems:   "center",
                  padding:      "12px 16px",
                  border:       "none",
                  borderBottom: "1px solid var(--separator)",
                  background:   t.id === current.id ? "rgba(0,122,255,0.06)" : "transparent",
                  cursor:       "pointer",
                  gap:          10,
                  fontFamily:   "inherit",
                  textAlign:    "left",
                }}
              >
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 15, fontWeight: 500, color: "var(--foreground)", margin: 0 }}>{t.label}</p>
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0, marginTop: 2 }}>{t.short}</p>
                </div>
                {t.id === current.id && (
                  <Check size={15} strokeWidth={2.5} style={{ color: "var(--primary)", flexShrink: 0 }} />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
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

  // ── Button percentage positions — mapped from SVG peg coordinates ──
  // Headstock viewBox: 200 × 300
  //   PEG positions: cx ∈ {20, 180}, cy ∈ {58, 108}
  //   left%  = cx / 200 * 100    right side: 180/200 = 90%
  //   top%   = cy / 300 * 100    top pegs: 58/300 = 19.33%, bottom: 108/300 = 36%
  //
  // StringBtn uses transform: translate(-50%, -50%) so the button is
  // centred exactly on the percentage anchor point.
  const PEG_POS = {
    G: { left: "10%", top: "36%"   },   // bottom-left
    C: { left: "10%", top: "19.33%" },  // top-left
    E: { left: "90%", top: "19.33%" },  // top-right
    A: { left: "90%", top: "36%"   },   // bottom-right
  }

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
      <div
        style={{
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          padding:        "10px 20px 2px",
          flexShrink:     0,
        }}
      >
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
        <HorizontalMeter
          cents={cents}
          isActive={isListening && detectedFreq !== null}
          inTune={inTune}
        />
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0 14px", marginTop: 0 }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500 }}>Flat</span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500 }}>Sharp</span>
        </div>
      </div>

      {/* ── Headstock illustration + string buttons ─────────────────────
          The SVG is responsive (width: 100%) inside a relative container.
          Buttons are anchored at percentage positions matching peg coords
          and centred via transform: translate(-50%, -50%).
          ──────────────────────────────────────────────────────────────── */}
      <div
        style={{
          flex:            1,
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
          minHeight:       0,
          padding:         "4px 12px 0",
        }}
      >
        {/* Responsive container — aspect ratio 200:300 = 2:3 */}
        <div
          style={{
            position:  "relative",
            width:     "100%",
            maxWidth:  240,
          }}
        >
          {/* SVG scales to container width; height follows 2:3 aspect ratio */}
          <MinimalHeadstock
            selectedString={selectedString}
            inTune={inTune}
            isListening={isListening}
          />

          {/* C — top-left peg */}
          <StringBtn
            name={s[1].name}
            isSelected={selectedString === 1}
            inTune={inTune} isListening={isListening}
            onClick={() => handleStringPress(1)}
            style={{ left: PEG_POS.C.left, top: PEG_POS.C.top }}
          />

          {/* G — bottom-left peg */}
          <StringBtn
            name={s[0].name}
            isSelected={selectedString === 0}
            inTune={inTune} isListening={isListening}
            onClick={() => handleStringPress(0)}
            style={{ left: PEG_POS.G.left, top: PEG_POS.G.top }}
          />

          {/* E — top-right peg */}
          <StringBtn
            name={s[2].name}
            isSelected={selectedString === 2}
            inTune={inTune} isListening={isListening}
            onClick={() => handleStringPress(2)}
            style={{ left: PEG_POS.E.left, top: PEG_POS.E.top }}
          />

          {/* A — bottom-right peg */}
          <StringBtn
            name={s[3].name}
            isSelected={selectedString === 3}
            inTune={inTune} isListening={isListening}
            onClick={() => handleStringPress(3)}
            style={{ left: PEG_POS.A.left, top: PEG_POS.A.top }}
          />
        </div>
      </div>

      {/* ── Instruction / mic error card ── */}
      <div style={{ padding: "8px 16px 16px", flexShrink: 0 }}>
        {micError ? (
          <div
            style={{
              background:    "var(--card)",
              borderRadius:  14,
              padding:       "14px 16px",
              display:       "flex",
              alignItems:    "center",
              justifyContent:"space-between",
              boxShadow:     "0 1px 8px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Mic size={20} strokeWidth={1.5} style={{ color: "var(--destructive)" }} />
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>
                  Microphone access required
                </p>
                <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0, marginTop: 1 }}>
                  Tap to try again
                </p>
              </div>
            </div>
            <button
              onClick={startListening}
              style={{
                background: "var(--primary)", color: "#FFFFFF", border: "none",
                borderRadius: 8, padding: "6px 14px", fontSize: 14, fontWeight: 600,
                cursor: "pointer", flexShrink: 0,
              }}
            >
              Allow
            </button>
          </div>
        ) : (
          <div
            style={{
              background:   "var(--card)",
              borderRadius: 14,
              padding:      "14px 16px",
              display:      "flex",
              alignItems:   "center",
              gap:          14,
              boxShadow:    "0 1px 8px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.04)",
            }}
          >
            <AudioLines
              size={28} strokeWidth={1.5}
              style={{
                color:      "var(--primary)",
                flexShrink: 0,
                opacity:    isListening ? 1 : 0.4,
                transition: "opacity 0.3s ease",
              }}
            />
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
