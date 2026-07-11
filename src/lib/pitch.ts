// ── Pitch detection via autocorrelation ──────────────────────────────
// Based on the well-known autocorrelation algorithm used in web tuner apps.
// Returns the detected frequency in Hz, or null if no clear pitch is found.

export interface PitchDetectionResult {
  frequency: number | null
  clarity: number // 0-1, how confident the detection is
}

let audioContext: AudioContext | null = null
let mediaStream: MediaStream | null = null
let analyser: AnalyserNode | null = null
let sourceNode: MediaStreamAudioSourceNode | null = null
let animationFrameId: number | null = null
let buffer: Float32Array<ArrayBuffer> | null = null

const BUFFER_SIZE = 4096

export async function startPitchDetection(
  onPitch: (result: PitchDetectionResult) => void,
): Promise<void> {
  if (animationFrameId !== null) return // already running

  audioContext = new AudioContext()
  if (audioContext.state === "suspended") await audioContext.resume()

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  })

  sourceNode = audioContext.createMediaStreamSource(mediaStream)
  analyser = audioContext.createAnalyser()
  analyser.fftSize = BUFFER_SIZE
  buffer = new Float32Array(analyser.fftSize)

  sourceNode.connect(analyser)

  const detect = () => {
    if (!analyser || !buffer) return

    analyser.getFloatTimeDomainData(buffer)
    const result = detectPitch(buffer, audioContext!.sampleRate)
    onPitch(result)
    animationFrameId = requestAnimationFrame(detect)
  }

  detect()
}

export function stopPitchDetection(): void {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  if (sourceNode) {
    sourceNode.disconnect()
    sourceNode = null
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop())
    mediaStream = null
  }
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
  analyser = null
  buffer = null
}

function detectPitch(buf: Float32Array, sampleRate: number): PitchDetectionResult {
  const SIZE = buf.length

  // Compute RMS to check if there's enough signal
  let rms = 0
  for (let i = 0; i < SIZE; i++) {
    rms += buf[i] * buf[i]
  }
  rms = Math.sqrt(rms / SIZE)

  if (rms < 0.01) {
    return { frequency: null, clarity: 0 }
  }

  const yinResult = detectPitchYIN(buf, sampleRate)
  if (!yinResult) {
    return { frequency: null, clarity: 0 }
  }

  return {
    frequency: yinResult.frequency,
    clarity: yinResult.clarity,
  }
}

function detectPitchYIN(
  samples: Float32Array,
  sampleRate: number,
): { frequency: number; clarity: number } | null {
  const minFrequency = 60
  const maxFrequency = 1000
  const maxTau = Math.floor(sampleRate / minFrequency)
  const minTau = Math.floor(sampleRate / maxFrequency)
  const yinBuffer = new Float32Array(maxTau + 1)

  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0
    const limit = samples.length - tau
    for (let i = 0; i < limit; i++) {
      const delta = samples[i] - samples[i + tau]
      sum += delta * delta
    }
    yinBuffer[tau] = sum
  }

  let runningSum = 0
  yinBuffer[0] = 1
  for (let tau = 1; tau <= maxTau; tau++) {
    runningSum += yinBuffer[tau]
    yinBuffer[tau] = runningSum === 0 ? 1 : (yinBuffer[tau] * tau) / runningSum
  }

  const threshold = 0.12
  let tauEstimate = -1
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (yinBuffer[tau] < threshold) {
      while (tau + 1 <= maxTau && yinBuffer[tau + 1] < yinBuffer[tau]) {
        tau++
      }
      tauEstimate = tau
      break
    }
  }

  if (tauEstimate < 0) return null

  const prev = tauEstimate > 1 ? yinBuffer[tauEstimate - 1] : yinBuffer[tauEstimate]
  const curr = yinBuffer[tauEstimate]
  const next = tauEstimate + 1 <= maxTau ? yinBuffer[tauEstimate + 1] : curr
  const denominator = 2 * (2 * curr - prev - next)
  const betterTau = denominator !== 0 ? tauEstimate + (next - prev) / denominator : tauEstimate
  const frequency = sampleRate / betterTau
  const clarity = Math.max(0, Math.min(1, 1 - curr))

  if (!Number.isFinite(frequency) || frequency < minFrequency || frequency > maxFrequency) {
    return null
  }

  return { frequency, clarity }
}

// ── Convert frequency to note name + cents offset ─────────────────────
export function frequencyToNote(frequency: number): { note: string; octave: number; cents: number } {
  const A4 = 440
  const semitones = 12 * Math.log2(frequency / A4)
  const roundedSemitones = Math.round(semitones)
  const cents = Math.round((semitones - roundedSemitones) * 100)

  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

  // MIDI note number for A4 = 69
  const midiNote = 69 + roundedSemitones
  const noteIndex = ((midiNote % 12) + 12) % 12
  const octave = Math.floor(midiNote / 12) - 1

  return {
    note: noteNames[noteIndex],
    octave,
    cents,
  }
}

// ── Calculate cents difference between detected and target ────────────
export function centsDifference(detected: number, target: number): number {
  return Math.round(1200 * Math.log2(detected / target))
}
