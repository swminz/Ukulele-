import { useState, useEffect, useRef, useCallback } from "react"
import { playTimerDone, haptic } from "@/lib/audio"
import { Play, Pause, RotateCcw } from "lucide-react"

const PRESETS = [
  { label: "5 min", seconds: 300 },
  { label: "10 min", seconds: 600 },
  { label: "15 min", seconds: 900 },
  { label: "30 min", seconds: 1800 },
]

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

export function PracticeTimer() {
  const [duration, setDuration] = useState(600)
  const [remaining, setRemaining] = useState(600)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [customInput, setCustomInput] = useState("")
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const reset = useCallback((newDuration?: number) => {
    const d = newDuration ?? duration
    if (intervalRef.current) clearInterval(intervalRef.current)
    setRunning(false)
    setDone(false)
    setRemaining(d)
    if (newDuration !== undefined) setDuration(newDuration)
  }, [duration])

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setRunning(false)
          setDone(true)
          playTimerDone()
          haptic([0, 100, 50, 100, 50, 200])
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  const toggle = () => {
    if (done) { reset(); return }
    haptic(10)
    setRunning((v) => !v)
  }

  const handleCustom = () => {
    const mins = parseFloat(customInput)
    if (!isNaN(mins) && mins > 0) {
      reset(Math.round(mins * 60))
      setCustomInput("")
    }
  }

  const progress = duration > 0 ? (remaining / duration) : 0
  const circumference = 2 * Math.PI * 54
  const strokeDash = circumference * progress

  return (
    <div className="surface-card p-5">
      <p className="section-label mb-4">Practice Timer</p>

      {/* Circular progress */}
      <div className="flex justify-center mb-5">
        <div className="relative">
          <svg width={128} height={128} className="-rotate-90">
            <circle
              cx={64} cy={64} r={54}
              fill="none"
              stroke="var(--muted)"
              strokeWidth={6}
            />
            <circle
              cx={64} cy={64} r={54}
              fill="none"
              stroke={done ? "var(--success)" : remaining <= 60 ? "var(--destructive)" : "var(--primary)"}
              strokeWidth={6}
              strokeDasharray={`${strokeDash} ${circumference}`}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.5s ease, stroke 0.3s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-2xl font-bold tabular-nums leading-none"
              style={{ color: done ? "var(--success)" : remaining <= 60 && running ? "var(--destructive)" : "var(--foreground)" }}
            >
              {done ? "Done" : formatTime(remaining)}
            </span>
            {!done && (
              <span className="text-[10px] text-muted-foreground mt-1">
                {running ? "remaining" : "paused"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Preset buttons */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => reset(p.seconds)}
            aria-label={`Set timer to ${p.label}`}
            className="h-9 rounded-xl text-xs font-medium transition-all active:scale-95"
            style={
              duration === p.seconds && !done
                ? { background: "color-mix(in srgb, var(--primary) 15%, transparent)", color: "var(--primary)", border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)" }
                : { background: "var(--muted)", color: "var(--muted-foreground)" }
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom input */}
      <div className="flex gap-2 mb-4">
        <input
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCustom()}
          placeholder="Custom (minutes)"
          type="number"
          min={0.5}
          className="flex-1 h-9 px-3 rounded-xl text-sm"
          style={{
            background: "var(--muted)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
            outline: "none",
          }}
        />
        <button
          onClick={handleCustom}
          className="px-4 h-9 rounded-xl text-xs font-semibold active:scale-95 transition-transform"
          style={{ background: "var(--muted)", color: "var(--foreground)" }}
        >
          Set
        </button>
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        <button
          onClick={toggle}
          aria-label={running ? "Pause" : done ? "Reset" : "Start"}
          className="flex-1 h-12 rounded-2xl flex items-center justify-center gap-2 font-semibold text-sm transition-all active:scale-95"
          style={running
            ? { background: "var(--muted)", color: "var(--foreground)" }
            : done
            ? { background: "var(--success)", color: "var(--primary-foreground)" }
            : { background: "var(--primary)", color: "var(--primary-foreground)" }
          }
        >
          {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {running ? "Pause" : done ? "Done! Reset" : "Start"}
        </button>

        <button
          onClick={() => reset()}
          aria-label="Reset timer"
          className="w-12 h-12 rounded-2xl flex items-center justify-center active:scale-90 transition-transform"
          style={{ background: "var(--muted)" }}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
