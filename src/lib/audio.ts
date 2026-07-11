// ── Web Audio context (singleton) ────────────────────────────────────
let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx || ctx.state === "closed") {
    ctx = new AudioContext()
  }
  return ctx
}

// ── Plucked string sound (Karplus-Strong inspired) ────────────────────
// Produces a realistic plucked-string tone with harmonics and natural decay.
// Auto-stops after ~3 seconds — mimics a physical string being plucked once.
let activeOscillators: { osc: OscillatorNode; gain: GainNode }[] = []

export function playString(frequency: number, duration = 3.0): void {
  const context = getCtx()
  if (context.state === "suspended") context.resume()

  stopString()

  const now = context.currentTime

  // Fundamental + harmonics for a richer, string-like tone
  const harmonics = [
    { ratio: 1,    gain: 0.50, type: "triangle" as OscillatorType },
    { ratio: 2,    gain: 0.20, type: "sine" as OscillatorType },
    { ratio: 3,    gain: 0.10, type: "sine" as OscillatorType },
    { ratio: 4,    gain: 0.05, type: "sine" as OscillatorType },
  ]

  // Master gain with pluck envelope: fast attack, exponential decay
  const masterGain = context.createGain()
  masterGain.gain.setValueAtTime(0, now)
  masterGain.gain.linearRampToValueAtTime(0.6, now + 0.005) // very fast attack (pluck)
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration) // natural decay
  masterGain.connect(context.destination)

  // Lowpass filter to warm the tone
  const filter = context.createBiquadFilter()
  filter.type = "lowpass"
  filter.frequency.setValueAtTime(frequency * 8, now)
  filter.frequency.exponentialRampToValueAtTime(frequency * 2, now + duration)
  filter.Q.value = 0.5
  filter.connect(masterGain)

  const created: { osc: OscillatorNode; gain: GainNode }[] = []

  for (const h of harmonics) {
    const osc = context.createOscillator()
    osc.type = h.type
    osc.frequency.value = frequency * h.ratio

    const gain = context.createGain()
    gain.gain.value = h.gain

    osc.connect(gain)
    gain.connect(filter)
    osc.start(now)
    osc.stop(now + duration)

    created.push({ osc, gain })
  }

  activeOscillators = [{ osc: created[0].osc, gain: masterGain }]
  // Clean up after stop
  setTimeout(() => {
    activeOscillators = []
  }, (duration + 0.1) * 1000)
}

export function stopString(): void {
  const context = getCtx()
  const now = context.currentTime
  for (const { osc, gain } of activeOscillators) {
    try {
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(0, now + 0.05)
      osc.stop(now + 0.06)
    } catch {}
  }
  activeOscillators = []
}

export function isStringPlaying(): boolean {
  return activeOscillators.length > 0
}

// ── Reference tone (continuous sine, for reference) ───────────────────
export function playReferenceTone(frequency: number): void {
  const context = getCtx()
  if (context.state === "suspended") context.resume()

  stopString()

  const gain = context.createGain()
  gain.gain.setValueAtTime(0, context.currentTime)
  gain.gain.linearRampToValueAtTime(0.25, context.currentTime + 0.1)
  gain.connect(context.destination)

  const osc = context.createOscillator()
  osc.type = "sine"
  osc.frequency.value = frequency
  osc.connect(gain)
  osc.start()

  activeOscillators = [{ osc, gain }]
}

export function stopReferenceTone(): void {
  stopString()
}

// ── Metronome click sound ─────────────────────────────────────────────
export function createMetronomeClick(accent = false): void {
  const context = getCtx()
  if (context.state === "suspended") context.resume()

  const duration = 0.05
  const bufferSize = Math.ceil(context.sampleRate * duration)
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate)
  const data = buffer.getChannelData(0)

  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 12)
  }

  const source = context.createBufferSource()
  source.buffer = buffer

  const filter = context.createBiquadFilter()
  filter.type = "bandpass"
  filter.frequency.value = accent ? 2400 : 1200
  filter.Q.value = 0.8

  const gain = context.createGain()
  gain.gain.value = accent ? 0.8 : 0.5

  source.connect(filter)
  filter.connect(gain)
  gain.connect(context.destination)
  source.start()
}

// ── Timer done — gentle bell ──────────────────────────────────────────
export function playTimerDone(): void {
  const context = getCtx()
  if (context.state === "suspended") context.resume()

  const freqs = [523.25, 659.25, 783.99] // C5, E5, G5
  freqs.forEach((freq, i) => {
    const osc = context.createOscillator()
    const gain = context.createGain()
    const startTime = context.currentTime + i * 0.3

    osc.type = "sine"
    osc.frequency.value = freq

    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(0.25, startTime + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.0)

    osc.connect(gain)
    gain.connect(context.destination)
    osc.start(startTime)
    osc.stop(startTime + 1.0)
  })
}

// ── Haptic ────────────────────────────────────────────────────────────
export function haptic(pattern: number | number[] = 10): void {
  if ("vibrate" in navigator) {
    navigator.vibrate(pattern)
  }
}
