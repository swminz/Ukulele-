// ── PDF attachment (embedded inside a Song) ───────────────────────────
export interface SongPDF {
  data: ArrayBuffer
  filename: string
  size: number
  uploadedAt: number
  lastViewedPage: number
  bookmarks: number[]
}

// ── Audio attachment (uploaded reference track) ────────────────────────
export interface SongAudio {
  data:       ArrayBuffer
  filename:   string
  size:       number
  mimeType:   string
  uploadedAt: number
  duration?:  number   // seconds, populated lazily after first play
}

// ── Primary domain object ──────────────────────────────────────────────
export interface Song {
  id: string
  title: string
  artist: string
  album?: string
  key?: string
  capo?: number
  notes?: string
  content: string        // typed chords / lyrics
  createdAt: number
  modifiedAt: number
  lastPlayedAt?: number  // drives "recently played" sort option
  favorite: boolean
  pdf?: SongPDF          // optional PDF attachment
  audio?: SongAudio      // optional uploaded audio track
  isUploaded?: boolean   // true for files added via Upload Music
}

// ── Legacy shape – kept only for the DB migration path ────────────────
export interface PDFFile {
  id: string
  filename: string
  size: number
  uploadDate: number
  lastViewedPage: number
  favorite?: boolean
  bookmarks?: number[]
  data: ArrayBuffer
}

// ── Settings ───────────────────────────────────────────────────────────
export interface AppSettings {
  keepScreenAwake: boolean
  hapticFeedback: boolean
  largeText: boolean
  autoScrollSpeed: number
  lastTab: string
  metronome: {
    bpm: number
    accentBeat: boolean
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  keepScreenAwake: false,
  hapticFeedback: true,
  largeText: false,
  autoScrollSpeed: 40,
  lastTab: "practice",
  metronome: {
    bpm: 100,
    accentBeat: true,
  },
}
