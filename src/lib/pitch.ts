// ── Pitch detection — windowed YIN autocorrelation ───────────────────
//
// Improvements over the original:
//  • 8192-sample buffer for better low-frequency resolution
//  • Hann window applied before analysis (reduces spectral leakage)
//  • YIN threshold raised from 0.12 → 0.15 (more detections)
//  • Parabolic interpolation for sub-sample accuracy
//  • RMS silence gate: skip frames with too little energy
//  • Clarity expressed as 1 – normalised difference at best tau
//
// iOS compatibility:
//  • startPitchDetection() must be called from a user-gesture handler
//    (e.g. a button tap) so that new AudioContext() / resume() succeeds.
//    The ReferenceTuner triggers this on first string-button press.

export interface PitchDetectionResult {
  frequency: number | null
  clarity:   number          // 0–1
}

let audioContext:  AudioContext | null = null
let mediaStream:   MediaStream  | null = null
let analyser:      AnalyserNode | null = null
let sourceNode:    MediaStreamAudioSourceNode | null = null
let animationId:   number | null = null
let timeDomainBuf: Float32Array<ArrayBuffer> | null = null

const BUFFER_SIZE   = 8192    // larger → better low-freq resolution
const RMS_THRESHOLD = 0.008   // silence gate
const YIN_THRESHOLD = 0.15    // slightly permissive for real instruments

// ── Hann window ──────────────────────────────────────────────────────
function applyHannWindow(input: Float32Array): Float32Array {
  const out = new Float32Array(input.length)
  const N   = input.length
  for (let i = 0; i < N; i++) {
    out[i] = input[i] * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)))
  }
  return out
}

// ── YIN difference function ──────────────────────────────────────────
function yinDiff(buf: Float32Array, maxTau: number): Float32Array {
  const yin = new Float32Array(maxTau + 1)
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0
    const limit = buf.length - tau
    for (let i = 0; i < limit; i++) {
      const d = buf[i] - buf[i + tau]
      sum += d * d
    }
    yin[tau] = sum
  }
  return yin
}

// ── Cumulative mean normalised difference ────────────────────────────
function cmndf(yin: Float32Array): void {
  yin[0] = 1
  let running = 0
  for (let tau = 1; tau < yin.length; tau++) {
    running += yin[tau]
    yin[tau] = running === 0 ? 1 : (yin[tau] * tau) / running
  }
}

// ── Parabolic interpolation for sub-sample refinement ───────────────
function parabolicInterp(yin: Float32Array, tau: number): number {
  const prev = tau > 1                   ? yin[tau - 1] : yin[tau]
  const curr = yin[tau]
  const next = tau + 1 < yin.length     ? yin[tau + 1] : curr
  const denom = 2 * (2 * curr - prev - next)
  return denom !== 0 ? tau + (next - prev) / denom : tau
}

// ── Core pitch detection ─────────────────────────────────────────────
function detectPitch(rawBuf: Float32Array, sampleRate: number): PitchDetectionResult {
  // Silence gate
  let rms = 0
  for (let i = 0; i < rawBuf.length; i++) rms += rawBuf[i] * rawBuf[i]
  rms = Math.sqrt(rms / rawBuf.length)
  if (rms < RMS_THRESHOLD) return { frequency: null, clarity: 0 }

  // Windowing
  const buf = applyHannWindow(rawBuf)

  // Ukulele frequency range: 196 Hz (low G3) – 880 Hz (A5)
  // We use a slightly wider range for robustness
  const minFreq = 150
  const maxFreq = 1000
  const maxTau  = Math.floor(sampleRate / minFreq)
  const minTau  = Math.floor(sampleRate / maxFreq)

  const yin = yinDiff(buf, maxTau)
  cmndf(yin)

  // Find first tau below threshold (local minimum)
  let tauEst = -1
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (yin[tau] < YIN_THRESHOLD) {
      // Walk forward to true local minimum
      while (tau + 1 <= maxTau && yin[tau + 1] < yin[tau]) tau++
      tauEst = tau
      break
    }
  }

  if (tauEst < 0) {
    // No tau below strict threshold — try absolute minimum as fallback
    let minVal = Infinity, minTauFallback = -1
    for (let tau = minTau; tau <= maxTau; tau++) {
      if (yin[tau] < minVal) { minVal = yin[tau]; minTauFallback = tau }
    }
    if (minVal > 0.35 || minTauFallback < 0) return { frequency: null, clarity: 0 }
    tauEst = minTauFallback
  }

  const refinedTau = parabolicInterp(yin, tauEst)
  const frequency  = sampleRate / refinedTau
  const clarity    = Math.max(0, Math.min(1, 1 - yin[tauEst]))

  if (!Number.isFinite(frequency) || frequency < minFreq || frequency > maxFreq) {
    return { frequency: null, clarity: 0 }
  }

  return { frequency, clarity }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Start pitch detection.
 *
 * MUST be called from a user-gesture handler on iOS (tap, click, etc.).
 * Internally creates a new AudioContext and requests microphone access.
 */
export async function startPitchDetection(
  onPitch: (result: PitchDetectionResult) => void,
): Promise<void> {
  if (animationId !== null) return     // already running

  // Create AudioContext synchronously — must happen in user-gesture call stack
  audioContext = new AudioContext()
  // resume() here is within the user-gesture call chain → works on iOS
  if (audioContext.state === "suspended") {
    try { audioContext.resume() } catch {}
  }

  // Request mic — show system permission dialog if needed
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl:  false,
      // iOS sometimes ignores these, but setting them signals intent
      sampleRate:       { ideal: 44100 },
    },
  })

  // After getUserMedia resolves, resume again in case context is still suspended
  if (audioContext.state === "suspended") {
    try { await audioContext.resume() } catch {}
  }

  sourceNode = audioContext.createMediaStreamSource(mediaStream)
  analyser   = audioContext.createAnalyser()
  analyser.fftSize          = BUFFER_SIZE
  analyser.smoothingTimeConstant = 0   // raw frames — we handle smoothing ourselves
  timeDomainBuf = new Float32Array(analyser.fftSize)

  sourceNode.connect(analyser)

  const loop = () => {
    if (!analyser || !timeDomainBuf) return
    analyser.getFloatTimeDomainData(timeDomainBuf)
    onPitch(detectPitch(timeDomainBuf, audioContext!.sampleRate))
    animationId = requestAnimationFrame(loop)
  }
  loop()
}

export function stopPitchDetection(): void {
  if (animationId !== null) { cancelAnimationFrame(animationId); animationId = null }
  sourceNode?.disconnect();  sourceNode  = null
  mediaStream?.getTracks().forEach((t) => t.stop()); mediaStream = null
  audioContext?.close();     audioContext = null
  analyser      = null
  timeDomainBuf = null
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Convert raw frequency → note name + octave */
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

/** Cents difference between detected and target frequency */
export function centsDifference(detected: number, target: number): number {
  return Math.round(1200 * Math.log2(detected / target))
}
