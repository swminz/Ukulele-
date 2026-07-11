import { openDB, type IDBPDatabase } from "idb"
import type { Song, PDFFile, SongPDF } from "@/types"

const DB_NAME    = "ukepocket"
const DB_VERSION = 3   // bumped: PDFs now live inside Songs

interface UkePocketDB {
  songs: {
    key: string
    value: Song
    indexes: { "by-modified": number; "by-favorite": number }
  }
  pdfs: {
    key: string
    value: PDFFile
    indexes: { "by-upload": number; "by-favorite": number }
  }
}

let db: IDBPDatabase<UkePocketDB> | null = null

async function getDB() {
  if (db) return db
  db = await openDB<UkePocketDB>(DB_NAME, DB_VERSION, {
    upgrade(database, _oldVersion, _newVersion, tx) {
      // ── Songs store
      if (!database.objectStoreNames.contains("songs")) {
        const s = database.createObjectStore("songs", { keyPath: "id" })
        s.createIndex("by-modified", "modifiedAt")
        s.createIndex("by-favorite", "favorite")
      }
      // ── PDFs store (kept for legacy migration; new uploads live inside Songs)
      if (!database.objectStoreNames.contains("pdfs")) {
        const p = database.createObjectStore("pdfs", { keyPath: "id" })
        p.createIndex("by-upload", "uploadDate")
        p.createIndex("by-favorite", "favorite")
      } else {
        // Ensure by-favorite index exists (v1 installations lacked it)
        const store = tx.objectStore("pdfs")
        if (!store.indexNames.contains("by-favorite")) {
          store.createIndex("by-favorite", "favorite")
        }
      }
      // v3: lazy migration of legacy PDFFile records → Songs (see migratePDFsToSongs)
    },
  })
  return db
}

// ── One-time migration: convert legacy PDFFile records into Songs ──────

const MIGRATION_FLAG = "ukepocket_pdfs_migrated_v3"

export async function migratePDFsToSongs(): Promise<void> {
  if (localStorage.getItem(MIGRATION_FLAG)) return
  const database = await getDB()
  const pdfs = await database.getAll("pdfs")
  if (pdfs.length === 0) {
    localStorage.setItem(MIGRATION_FLAG, "1")
    return
  }
  const tx = database.transaction(["songs", "pdfs"], "readwrite")
  for (const pdfFile of pdfs) {
    const songId = `pdf_migrated_${pdfFile.id}`
    // Check if already migrated
    const existing = await tx.objectStore("songs").get(songId)
    if (!existing) {
      const songPDF: SongPDF = {
        data: pdfFile.data,
        filename: pdfFile.filename,
        size: pdfFile.size,
        uploadedAt: pdfFile.uploadDate,
        lastViewedPage: pdfFile.lastViewedPage,
        bookmarks: pdfFile.bookmarks ?? [],
      }
      const song: Song = {
        id: songId,
        title: pdfFile.filename.replace(/\.pdf$/i, ""),
        artist: "",
        content: "",
        createdAt: pdfFile.uploadDate,
        modifiedAt: pdfFile.uploadDate,
        favorite: pdfFile.favorite ?? false,
        pdf: songPDF,
      }
      await tx.objectStore("songs").put(song)
    }
    // Remove from legacy store
    await tx.objectStore("pdfs").delete(pdfFile.id)
  }
  await tx.done
  localStorage.setItem(MIGRATION_FLAG, "1")
}

// ── Songs ──────────────────────────────────────────────────────────────

export async function getAllSongs(): Promise<Song[]> {
  const database = await getDB()
  const songs = await database.getAll("songs")
  return songs.sort((a, b) => b.modifiedAt - a.modifiedAt)
}

export async function getSong(id: string): Promise<Song | undefined> {
  const database = await getDB()
  return database.get("songs", id)
}

export async function saveSong(song: Song): Promise<void> {
  const database = await getDB()
  await database.put("songs", song)
}

export async function deleteSong(id: string): Promise<void> {
  const database = await getDB()
  await database.delete("songs", id)
}

/** Update only the PDF metadata (page + bookmarks) without fetching the full song */
export async function updateSongPDFMeta(
  songId: string,
  meta: Partial<Pick<SongPDF, "lastViewedPage" | "bookmarks">>,
): Promise<void> {
  const database = await getDB()
  const song = await database.get("songs", songId)
  if (!song?.pdf) return
  await database.put("songs", {
    ...song,
    pdf: { ...song.pdf, ...meta },
  })
}

/** Persist parsed PDF text without mutating other song fields. */
export async function updateSongPDFParsedText(songId: string, parsedText: string): Promise<void> {
  const database = await getDB()
  const song = await database.get("songs", songId)
  if (!song?.pdf) return
  await database.put("songs", {
    ...song,
    modifiedAt: Date.now(),
    pdf: { ...song.pdf, parsedText },
  })
}

// ── Backup / Restore ───────────────────────────────────────────────────

export async function exportBackup(): Promise<string> {
  const songs = await getAllSongs()
  // Convert ArrayBuffers in pdf attachments to base64 for JSON serialisation
  const songsExport = songs.map((s) => ({
    ...s,
    pdf: s.pdf ? { ...s.pdf, data: arrayBufferToBase64(s.pdf.data) } : undefined,
  }))
  return JSON.stringify({ version: 2, songs: songsExport }, null, 2)
}

export async function importBackup(json: string): Promise<{ songs: number }> {
  type RawSong = Omit<Song, "pdf"> & {
    pdf?: Omit<SongPDF, "data"> & { data: string }
  }
  const parsed = JSON.parse(json) as {
    version: number
    songs?: RawSong[]
    // Legacy v1 backup may have a pdfs array
    pdfs?: Array<Omit<PDFFile, "data"> & { data: string }>
  }

  const database = await getDB()
  const tx = database.transaction(["songs"], "readwrite")
  let count = 0

  // Modern v2 format
  for (const s of parsed.songs ?? []) {
    const song: Song = {
      ...s,
      pdf: s.pdf ? { ...s.pdf, data: base64ToArrayBuffer(s.pdf.data) } : undefined,
    }
    await tx.objectStore("songs").put(song)
    count++
  }

  // Legacy v1 format: convert pdfs array into songs
  for (const p of parsed.pdfs ?? []) {
    const songId = `pdf_imported_${p.id}`
    const song: Song = {
      id: songId,
      title: p.filename.replace(/\.pdf$/i, ""),
      artist: "",
      content: "",
      createdAt: p.uploadDate,
      modifiedAt: p.uploadDate,
      favorite: p.favorite ?? false,
      pdf: {
        data: base64ToArrayBuffer(p.data),
        filename: p.filename,
        size: p.size,
        uploadedAt: p.uploadDate,
        lastViewedPage: p.lastViewedPage,
        bookmarks: p.bookmarks ?? [],
      },
    }
    await tx.objectStore("songs").put(song)
    count++
  }

  await tx.done
  return { songs: count }
}

// ── Helpers ────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

// ── Legacy exports (kept so imports in unmigrated files don't crash) ───
/** @deprecated Use saveSong with embedded pdf instead */
export async function getAllPDFs(): Promise<PDFFile[]> { return [] }
/** @deprecated */
export async function savePDF(_pdf: PDFFile): Promise<void> {}
/** @deprecated */
export async function deletePDF(_id: string): Promise<void> {}
/** @deprecated */
export async function updatePDFPage(_id: string, _page: number): Promise<void> {}
