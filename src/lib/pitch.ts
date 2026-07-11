// ── Pitch detection — McLeod Pitch Method (MPM) ──────────────────────
//
// Upgraded from YIN to MPM for improved accuracy on real instruments:
//
//  ALGORITHM  McLeod Pitch Method (MPM) — "A smarter way to find pitch"
//             McLeod & Wyvill, 2005.
//  KEY STEPS  1. Apply Hann window to reduce spectral leakage
//             2. Compute Normalised Square Difference Function (NSDF)
//             3. Find key maxima (highest point in each positive region)
//             4. Select the first maximum above 93 % of the global max
//             5. Parabolic interpolation for sub-sample precision
//             6. Sub-harmonic validation to eliminate octave errors
//
//  MPM vs YIN • NSDF is frequency-independent → threshold works uniformly
//             • Key-maxima selection avoids the YIN octave-doubling artifact
//             • Better at detecting C4 (261 Hz) cleanly on uke
//
//  iOS compat • startPitchDetection() MUST be called from a user gesture so
//               AudioContext.resume() / getUserMedia succeed on Safari.

export interface PitchDetectionResult {
  frequency: number | null
  clarity:   number           // 0–1 (MPM peak value)
}

// ── Module-level Web Audio state ─────────────────────────────────────
let audioCtx:    AudioContext | null = null
let mediaStream: MediaStream  | null = null
let analyser:    AnalyserNode | null = null
let sourceNode:  MediaStreamAudioSourceNode | null = null
let animationId: number | null = null
let timeDomainBuf: Float32Array<ArrayBuffer> | null = null

// ── Detection constants ───────────────────────────────────────────────
const BUFFER_SIZE      = 8192   // 8 k samples → ~186 ms @ 44.1 kHz — good for C4
const RMS_FLOOR        = 0.006  // strict silence gate (was 0.008 — slightly quieter)
const MPM_K            = 0.93   // key-maximum threshold (standard MPM value)

// Ukulele physical range: low-G3 (196 Hz) – A5 (880 Hz) + headroom
const FREQ_MIN = 150
const FREQ_MAX = 1000

// ── Hann window ───────────────────────────────────────────────────────
function applyHannWindow(buf: Float32Array): Float32Array {
  const N   = buf.length
  const out = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    out[i] = buf[i] * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)))
  }
  return out
}

// ── Normalised Square Difference Function (NSDF) ──────────────────────
//
// m'(τ) = 2 · Σ x(i)·x(i+τ) / Σ (x(i)² + x(i+τ)²)
//
// Values in [-1, 1]; peaks near 1 indicate a strong periodic match.
function computeNSDF(buf: Float32Array, minLag: number, maxLag: number): Float32Array {
  const N    = buf.length
  const nsdf = new Float32Array(maxLag + 1)

  for (let lag = minLag; lag <= maxLag; lag++) {
    let acf  = 0   // numerator: cross-correlation
    let norm = 0   // denominator: sum of squared amplitudes
    const n  = N - lag
    for (let i = 0; i < n; i++) {
      acf  += buf[i] * buf[i + lag]
      norm += buf[i] * buf[i] + buf[i + lag] * buf[i + lag]
    }
    nsdf[lag] = norm > 1e-10 ? (2 * acf) / norm : 0
  }

  return nsdf
}

// ── Key-maxima extraction ─────────────────────────────────────────────
//
// Scan the NSDF for positive regions; pick the highest point in each.
// These are the "key maxima" per the MPM paper.
function findKeyMaxima(
  nsdf:   Float32Array,
  minLag: number,
  maxLag: number,
): Array<{ lag: number; value: number }> {
  const maxima: Array<{ lag: number; value: number }> = []
  let inPos     = false
  let bestVal   = -Infinity
  let bestLag   = -1

  for (let lag = minLag; lag <= maxLag; lag++) {
    const v = nsdf[lag]
    if (v > 0) {
      inPos = true
      if (v > bestVal) { bestVal = v; bestLag = lag }
    } else if (inPos) {
      if (bestLag >= 0 && bestVal > 0) maxima.push({ lag: bestLag, value: bestVal })
      inPos = false; bestVal = -Infinity; bestLag = -1
    }
  }
  if (inPos && bestLag >= 0 && bestVal > 0) maxima.push({ lag: bestLag, value: bestVal })

  return maxima
}

// ── Parabolic interpolation for sub-sample refinement ─────────────────
function parabolicInterp(nsdf: Float32Array, lag: number): number {
  const prev = lag > 0             ? nsdf[lag - 1] : nsdf[lag]
  const curr = nsdf[lag]
  const next = lag + 1 < nsdf.length ? nsdf[lag + 1] : curr
  const denom = 2 * (2 * curr - prev - next)
  return denom !== 0 ? lag + (next - prev) / denom : lag
}

// ── Sub-harmonic octave-error fix ────────────────────────────────────
//
// MPM occasionally picks up the 2nd harmonic (octave up).
// If the detected frequency is close to 2× a target string's frequency,
// we halve it and verify the halved frequency also makes physical sense.
const UKE_TARGETS = [196.0, 261.63, 329.63, 392.0, 440.0, 493.88]

function fixOctaveError(freq: number, sampleRate: number): number {
  const sub = freq / 2
  if (sub < FREQ_MIN) return freq   // already at fundamental range

  // Is the halved frequency closer to a known uke string?
  const errFull = Math.min(...UKE_TARGETS.map((t) => Math.abs(freq - t)))
  const errHalf = Math.min(...UKE_TARGETS.map((t) => Math.abs(sub  - t)))

  // Halve only when sub-harmonic is clearly a better match (>25 Hz closer)
  return errHalf + 25 < errFull ? sub : freq

  // suppress unused warning
  void sampleRate
}

// ── Core pitch detection (single frame) ──────────────────────────────
function detectPitch(rawBuf: Float32Array, sampleRate: number): PitchDetectionResult {
  // 1. RMS silence gate
  let rms = 0
  for (let i = 0; i < rawBuf.length; i++) rms += rawBuf[i] * rawBuf[i]
  rms = Math.sqrt(rms / rawBuf.length)
  if (rms < RMS_FLOOR) return { frequency: null, clarity: 0 }

  // 2. Hann window
  const buf = applyHannWindow(rawBuf)

  // 3. Lag bounds for the target frequency range
  const maxLag = Math.floor(sampleRate / FREQ_MIN)
  const minLag = Math.floor(sampleRate / FREQ_MAX)

  // 4. NSDF
  const nsdf = computeNSDF(buf, minLag, maxLag)

  // 5. Key maxima
  const maxima = findKeyMaxima(nsdf, minLag, maxLag)
  if (maxima.length === 0) return { frequency: null, clarity: 0 }

  // 6. Global maximum and MPM threshold
  let globalMax = -Infinity
  for (const m of maxima) if (m.value > globalMax) globalMax = m.value

  if (globalMax <= 0) return { frequency: null, clarity: 0 }
  const threshold = MPM_K * globalMax

  // 7. Pick the first key maximum above the threshold (lowest lag = highest freq)
  let chosenLag = -1
  let chosenClarity = 0
  for (const m of maxima) {
    if (m.value >= threshold) {
      chosenLag     = m.lag
      chosenClarity = m.value
      break
    }
  }
  if (chosenLag < 0) { chosenLag = maxima[0].lag; chosenClarity = maxima[0].value }

  // 8. Sub-sample refinement via parabolic interpolation
  const refinedLag = parabolicInterp(nsdf, chosenLag)
  let   frequency  = sampleRate / refinedLag

  // 9. Guard: frequency must be within expected range
  if (!Number.isFinite(frequency) || frequency < FREQ_MIN || frequency > FREQ_MAX) {
    return { frequency: null, clarity: 0 }
  }

  // 10. Sub-harmonic octave-error correction
  frequency = fixOctaveError(frequency, sampleRate)

  return { frequency, clarity: Math.max(0, Math.min(1, chosenClarity)) }
}

// ── Median filter — 3-frame rolling buffer ────────────────────────────
// Suppresses transient spikes without adding lag.
const MEDIAN_N = 3
const medianBuf: number[] = []

function medianFilter(value: number): number {
  medianBuf.push(value)
  if (medianBuf.length > MEDIAN_N) medianBuf.shift()
  const sorted = [...medianBuf].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Start live pitch detection.
 *
 * MUST be called from within a user-gesture handler (tap/click) on iOS
 * so that AudioContext creation and getUserMedia both succeed.
 *
 * @param onPitch  Called every animation frame with the latest reading.
 */
export async function startPitchDetection(
  onPitch: (result: PitchDetectionResult) => void,
): Promise<void> {
  if (animationId !== null) return   // already running

  // Create AudioContext synchronously inside the user-gesture call stack
  audioCtx = new AudioContext()
  if (audioCtx.state === "suspended") {
    try { audioCtx.resume() } catch {}
  }

  // Request microphone with quality constraints
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl:  false,
      sampleRate:       { ideal: 44100 },
      channelCount:     { ideal: 1 },
    },
  })

  // Resume again — getUserMedia can suspend the context on some browsers
  if (audioCtx.state === "suspended") {
    try { await audioCtx.resume() } catch {}
  }

  // Wire audio graph: mic → analyser (no output → no feedback)
  sourceNode = audioCtx.createMediaStreamSource(mediaStream)
  analyser   = audioCtx.createAnalyser()
  analyser.fftSize               = BUFFER_SIZE
  analyser.smoothingTimeConstant = 0   // raw frames; caller handles smoothing
  timeDomainBuf = new Float32Array(analyser.fftSize)

  sourceNode.connect(analyser)

  // Warm up the median filter
  medianBuf.length = 0

  const loop = () => {
    if (!analyser || !timeDomainBuf || !audioCtx) return
    analyser.getFloatTimeDomainData(timeDomainBuf)
    const raw = detectPitch(timeDomainBuf, audioCtx.sampleRate)

    // Apply median filter to reject single-frame spikes
    const result: PitchDetectionResult = raw.frequency !== null
      ? { frequency: medianFilter(raw.frequency), clarity: raw.clarity }
      : raw

    onPitch(result)
    animationId = requestAnimationFrame(loop)
  }
  loop()
}

/** Stop pitch detection and release all audio resources. */
export function stopPitchDetection(): void {
  if (animationId !== null) { cancelAnimationFrame(animationId); animationId = null }
  sourceNode?.disconnect();  sourceNode  = null
  mediaStream?.getTracks().forEach((t) => t.stop()); mediaStream = null
  audioCtx?.close();         audioCtx   = null
  analyser      = null
  timeDomainBuf = null
  medianBuf.length = 0
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Convert a frequency (Hz) to the nearest note name + octave + cents offset. */
export function frequencyToNote(freq: number): { note: string; octave: number; cents: number } {
  const A4        = 440
  const semitones = 12 * Math.log2(freq / A4)
  const rounded   = Math.round(semitones)
  const cents     = Math.round((semitones - rounded) * 100)
  const noteNames = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
  const midi      = 69 + rounded
  return {
    note:   noteNames[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    cents,
  }
}

/**
 * Signed cents difference between a detected frequency and a target.
 * Negative = flat, positive = sharp.
 */
export function centsDifference(detected: number, target: number): number {
  return Math.round(1200 * Math.log2(detected / target))
}
