import { useState, useEffect, useRef, useCallback } from "react"
import { createMetronomeClick, haptic } from "@/lib/audio"
import { useSettings } from "@/hooks/use-settings"
import { ChevronRight } from "lucide-react"

const MIN_BPM = 40
const MAX_BPM = 220

// ── Tempo labels ──────────────────────────────────────────────────────────────
function tempoLabel(bpm: number): string {
  if (bpm < 60)  return "Largo"
  if (bpm < 66)  return "Larghetto"
  if (bpm < 76)  return "Adagio"
  if (bpm < 108) return "Andante"
  if (bpm < 120) return "Moderato"
  if (bpm < 156) return "Allegro"
  if (bpm < 176) return "Vivace"
  if (bpm < 200) return "Presto"
  return "Prestissimo"
}

type TimeSig = 2 | 3 | 4
const TIME_SIG_CYCLE: TimeSig[] = [2, 3, 4]

// ── Voice recognition wiring ──────────────────────────────────────────────────
const SPEECH_SUPPORTED =
  typeof window !== "undefined" &&
  ("SpeechRecognition" in (window as unknown as Record<string, unknown>) ||
    "webkitSpeechRecognition" in (window as unknown as Record<string, unknown>))

type SRLike = {
  continuous: boolean; interimResults: boolean; lang: string
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null; onend: (() => void) | null
  start: () => void; stop: () => void
}
type SRCtor = new () => SRLike

// ── Circular tempo wheel ──────────────────────────────────────────────────────
// 270° sweep: -135° (7 o'clock, BPM=40) … +135° (5 o'clock, BPM=220)
// Angle convention: 0° = 12 o'clock, increasing clockwise.

const CX = 140
const CY = 140
const R_TRACK   = 112   // dashes sit here
const R_INNER   = 98    // inner end of major dashes
const R_INNER_m = 104   // inner end of minor dashes
const R_HANDLE  = 112   // handle dot sits on the track circle

const TOTAL_DASH = 54   // 54 dashes × 5° = 270° total sweep
const START_DEG  = -135 // 7 o'clock

function bpmToDeg(bpm: number) {
  return START_DEG + ((bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 270
}

function degToXY(deg: number, r: number) {
  const rad = (deg * Math.PI) / 180
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) }
}

interface WheelProps {
  bpm: number
  running: boolean
  beat: number
  onBpmChange: (v: number) => void
  onToggle: () => void
}

function TempoWheel({ bpm, running, beat, onBpmChange, onToggle }: WheelProps) {
  const svgRef    = useRef<SVGSVGElement>(null)
  const dragging  = useRef(false)

  const handleDeg  = bpmToDeg(bpm)
  const { x: hx, y: hy } = degToXY(handleDeg, R_HANDLE)

  // Dashes arranged in the 270° arc (skip the "dead" bottom 90°)
  const dashes = Array.from({ length: TOTAL_DASH }, (_, i) => {
    const deg   = START_DEG + i * 5
    const major = i % 5 === 0
    const inner = major ? R_INNER : R_INNER_m
    const { x: x1, y: y1 } = degToXY(deg, inner)
    const { x: x2, y: y2 } = degToXY(deg, R_TRACK)
    // Is this dash "filled" (BPM swept up to this point)?
    const filled = deg <= handleDeg
    return { x1, y1, x2, y2, major, filled }
  })

  // Convert pointer position → BPM
  function pointerToBpm(e: React.PointerEvent<SVGSVGElement>) {
    const svg  = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width)  * 280 - CX
    const svgY = ((e.clientY - rect.top)  / rect.height) * 280 - CY
    let angle  = Math.atan2(svgX, -svgY) * (180 / Math.PI)   // 0°=top, cw+
    angle      = Math.max(START_DEG, Math.min(-START_DEG, angle))
    const raw  = MIN_BPM + ((angle - START_DEG) / 270) * (MAX_BPM - MIN_BPM)
    onBpmChange(Math.round(Math.max(MIN_BPM, Math.min(MAX_BPM, raw))))
  }

  // Beat ring pulse: flash the outer track circle on each beat
  const beatPulse = beat > 0

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 280 280"
      style={{ width: "100%", display: "block", touchAction: "none" }}
      aria-label="Tempo wheel"
      onPointerDown={(e) => {
        const dx = ((e.clientX - svgRef.current!.getBoundingClientRect().left) / svgRef.current!.getBoundingClientRect().width)  * 280 - CX
        const dy = ((e.clientY - svgRef.current!.getBoundingClientRect().top)  / svgRef.current!.getBoundingClientRect().height) * 280 - CY
        const dist = Math.hypot(dx, dy)
        // Drag only when near the handle ring (r 85–130) — let center tap fall through
        if (dist > 80 && dist < 135) {
          dragging.current = true
          svgRef.current!.setPointerCapture(e.pointerId)
          pointerToBpm(e)
        }
      }}
      onPointerMove={(e) => { if (dragging.current) pointerToBpm(e) }}
      onPointerUp={() => { dragging.current = false }}
      onPointerCancel={() => { dragging.current = false }}
    >
      {/* Outer track circle (faint ring) */}
      <circle cx={CX} cy={CY} r={R_TRACK}
        fill="none"
        stroke={beatPulse ? "var(--primary)" : "var(--separator)"}
        strokeWidth={1}
        style={{ transition: "stroke 0.06s ease" }}
        opacity={beatPulse ? 0.4 : 1}
      />

      {/* Dash marks */}
      {dashes.map(({ x1, y1, x2, y2, major, filled }, i) => (
        <line
          key={i}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="var(--primary)"
          strokeWidth={major ? 2 : 1}
          opacity={filled ? (major ? 0.8 : 0.45) : (major ? 0.18 : 0.10)}
          strokeLinecap="round"
        />
      ))}

      {/* Center circle background */}
      <circle cx={CX} cy={CY} r={56}
        fill="var(--card)"
        stroke="var(--separator)" strokeWidth={1}
      />

      {/* Play / Stop icon in center */}
      <g
        onClick={onToggle}
        style={{ cursor: "pointer" }}
      >
        <circle cx={CX} cy={CY} r={56} fill="transparent" />
        {running ? (
          /* Stop square */
          <rect
            x={CX - 12} y={CY - 12} width={24} height={24} rx={4}
            fill="var(--primary)"
          />
        ) : (
          /* Play triangle */
          <path
            d={`M ${CX - 9},${CY - 13} L ${CX + 15},${CY} L ${CX - 9},${CY + 13} Z`}
            fill="var(--primary)"
          />
        )}
      </g>

      {/* Handle dot */}
      <circle
        cx={hx} cy={hy} r={9}
        fill="var(--primary)"
        style={{ cursor: "grab", filter: "drop-shadow(0 2px 4px rgba(0,122,255,0.3))" }}
      />
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function Metronome() {
  const { settings, updateSettings } = useSettings()
  const [bpm,          setBpmState]  = useState(settings.metronome.bpm)
  const [running,      setRunning]   = useState(false)
  const [beat,         setBeat]      = useState(0)
  const [timeSig,      setTimeSig]   = useState<TimeSig>(4)
  const [accentBeat,   setAccentBeat] = useState(1)   // which beat number is accented

  const beatCountRef = useRef(0)
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const runningRef   = useRef(false)

  const setBpm = (v: number) => {
    const clamped = Math.max(MIN_BPM, Math.min(MAX_BPM, v))
    setBpmState(clamped)
    updateSettings({ metronome: { ...settings.metronome, bpm: clamped } })
  }

  const tick = useCallback(() => {
    beatCountRef.current = (beatCountRef.current % timeSig) + 1
    const next     = beatCountRef.current
    const isAccent = next === accentBeat
    createMetronomeClick(isAccent)
    if (settings.hapticFeedback) haptic(isAccent ? [5, 0, 5] : 5)
    setBeat(next)
    setTimeout(() => setBeat(0), 90)
  }, [timeSig, accentBeat, settings.hapticFeedback])

  useEffect(() => {
    if (!running) { if (intervalRef.current) clearInterval(intervalRef.current); return }
    const ms = (60 / bpm) * 1000
    tick()
    intervalRef.current = setInterval(tick, ms)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running, bpm, tick])

  useEffect(() => { runningRef.current = running }, [running])

  const toggleRunning = () => {
    haptic(15)
    if (running) beatCountRef.current = 0
    setRunning((v) => !v)
  }

  const handleTimeSig = () => {
    const idx = TIME_SIG_CYCLE.indexOf(timeSig)
    const next = TIME_SIG_CYCLE[(idx + 1) % TIME_SIG_CYCLE.length]
    setTimeSig(next)
    beatCountRef.current = 0
    setBeat(0)
    if (accentBeat > next) setAccentBeat(1)
  }

  // Passive voice recognition
  useEffect(() => {
    if (!SPEECH_SUPPORTED) return
    const win  = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
    const Ctor = (win.SpeechRecognition || win.webkitSpeechRecognition) as SRCtor | undefined
    if (!Ctor) return
    const rec      = new Ctor()
    rec.continuous = true; rec.interimResults = false; rec.lang = "en-US"
    rec.onresult = (e) => {
      const t = e.results[e.results.length - 1]?.[0]?.transcript?.trim().toLowerCase()
      if (t === "play" && !runningRef.current) setRunning(true)
      if (t === "stop" && runningRef.current)  setRunning(false)
    }
    rec.onerror = () => {}
    rec.onend   = () => {
      if (document.visibilityState === "visible") try { rec.start() } catch {}
    }
    try { rec.start() } catch {}
    return () => { rec.onend = null; rec.stop() }
  }, [])

  const pct   = ((bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 100
  const label = tempoLabel(bpm)

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        height:        "100%",
        background:    "var(--background)",
        overflowY:     "auto",
      }}
    >
      {/* ── Tempo: label + BPM hero + slider ─────────────────────────── */}
      <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
        <p className="section-label" style={{ paddingLeft: 2, marginBottom: 8 }}>Tempo</p>

        {/* BPM row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* − */}
          <button
            onClick={() => setBpm(bpm - 1)}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.9)" }}
            onPointerUp={(e)   => { (e.currentTarget as HTMLElement).style.transform = "scale(1)" }}
            aria-label="Decrease BPM"
            style={{
              width: 42, height: 42, borderRadius: 12,
              background: "var(--card)", border: "none",
              fontSize: 24, fontWeight: 300, color: "var(--foreground)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(60,60,67,0.1)",
              transition: "transform 0.08s ease", flexShrink: 0,
            }}
          >−</button>

          {/* BPM + labels */}
          <div style={{ flex: 1, textAlign: "center" }}>
            <p
              style={{
                fontSize:           64,
                fontWeight:         700,
                letterSpacing:      "-2px",
                lineHeight:         1,
                fontVariantNumeric: "tabular-nums",
                color:              running ? "var(--primary)" : "var(--foreground)",
                transition:         "color 0.25s ease",
              }}
            >
              {bpm}
            </p>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "var(--text-tertiary)", marginTop: 2 }}>
              BPM · {label}
            </p>
          </div>

          {/* + */}
          <button
            onClick={() => setBpm(bpm + 1)}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.9)" }}
            onPointerUp={(e)   => { (e.currentTarget as HTMLElement).style.transform = "scale(1)" }}
            aria-label="Increase BPM"
            style={{
              width: 42, height: 42, borderRadius: 12,
              background: "var(--card)", border: "none",
              fontSize: 24, fontWeight: 300, color: "var(--foreground)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(60,60,67,0.1)",
              transition: "transform 0.08s ease", flexShrink: 0,
            }}
          >+</button>
        </div>

        {/* Slider */}
        <div style={{ marginTop: 10 }}>
          <input
            type="range"
            min={MIN_BPM}
            max={MAX_BPM}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            aria-label="Tempo"
            style={{
              width:      "100%",
              background: `linear-gradient(to right, var(--primary) ${pct}%, rgba(120,120,128,0.18) 0%)`,
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{MIN_BPM}</span>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{MAX_BPM}</span>
          </div>
        </div>
      </div>

      {/* ── Time Signature ────────────────────────────────────────────── */}
      <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
        <p className="section-label" style={{ paddingLeft: 2, marginBottom: 6 }}>Time Signature</p>
        <button
          onClick={handleTimeSig}
          aria-label={`Time signature ${timeSig}/4 — tap to cycle`}
          style={{
            width:        "100%",
            position:     "relative",
            display:      "flex",
            alignItems:   "center",
            justifyContent: "center",
            background:   "var(--card)",
            border:       "none",
            borderRadius: 14,
            padding:      "10px 16px",
            cursor:       "pointer",
            boxShadow:    "0 1px 4px rgba(0,0,0,0.04), 0 0 0 1px rgba(60,60,67,0.08)",
            minHeight:    56,
          }}
        >
          <span
            style={{
              display:            "flex",
              alignItems:         "center",
              gap:                6,
              fontSize:           42,
              fontWeight:         700,
              letterSpacing:      "-1.5px",
              lineHeight:         1,
              fontVariantNumeric: "tabular-nums",
              color:              "var(--foreground)",
            }}
          >
            <span>{timeSig}</span>
            <span style={{ fontSize: 34, fontWeight: 300, color: "var(--text-tertiary)", letterSpacing: 0 }}>/</span>
            <span>4</span>
          </span>
          <ChevronRight size={16} strokeWidth={2} style={{ position: "absolute", right: 14, color: "var(--text-tertiary)", opacity: 0.45 }} />
        </button>
      </div>

      {/* ── Beat Accent ───────────────────────────────────────────────── */}
      <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
        <p className="section-label" style={{ paddingLeft: 2, marginBottom: 6 }}>Beat Accent</p>
        <div style={{ display: "flex", gap: 8 }}>
          {Array.from({ length: timeSig }, (_, i) => i + 1).map((n) => {
            const active = n === accentBeat
            const isBeat = beat === n
            return (
              <button
                key={n}
                onClick={() => setAccentBeat(n)}
                aria-label={`Accent beat ${n}`}
                aria-pressed={active}
                style={{
                  flex:         1,
                  height:       44,
                  borderRadius: 10,
                  border:       active ? "none" : "1.5px solid rgba(60,60,67,0.15)",
                  background:   active ? "var(--primary)" : isBeat ? "rgba(0,122,255,0.08)" : "var(--card)",
                  color:        active ? "#FFFFFF" : "var(--foreground)",
                  fontSize:     18,
                  fontWeight:   600,
                  cursor:       "pointer",
                  transition:   "background 0.15s ease, transform 0.06s ease",
                  transform:    isBeat ? "scale(1.08)" : "scale(1)",
                  boxShadow:    active ? "0 2px 8px rgba(0,122,255,0.25)" : "0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                {n}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Circular tempo wheel ──────────────────────────────────────── */}
      <div
        style={{
          flex:            1,
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
          padding:         "10px 24px 0",
          minHeight:       0,
        }}
      >
        <div style={{ width: "100%", maxWidth: 300 }}>
          <TempoWheel
            bpm={bpm}
            running={running}
            beat={beat}
            onBpmChange={setBpm}
            onToggle={toggleRunning}
          />
        </div>
      </div>

      {/* Safe-area spacer at the bottom */}
      <div style={{ height: "calc(var(--safe-bottom) + 8px)", flexShrink: 0 }} />
    </div>
  )
}
