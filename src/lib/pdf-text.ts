import * as pdfjsLib from "pdfjs-dist"

// Standard PDF.js worker from CDN (requested behavior).
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

/**
 * Extracts human-readable text from a PDF.
 * - Preserves line breaks (using item y-position + hasEOL when present)
 * - Preserves page boundaries
 */
export async function extractPDFText(data: ArrayBuffer): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ data: data.slice(0) })
  try {
    const doc = await loadingTask.promise
    const pages: string[] = []

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()

      const rows: string[] = []
      let currentLine = ""
      let lastY: number | null = null

      for (const item of content.items as Array<{
        str?: string
        transform?: number[]
        hasEOL?: boolean
      }>) {
        if (!item?.str) continue
        const y: number =
          typeof item.transform?.[5] === "number"
            ? item.transform[5]
            : (lastY ?? 0)

        // New line if Y changed enough or PDF explicitly marks EOL.
        if (lastY !== null && Math.abs(y - lastY) > 2.2) {
          if (currentLine.trim()) rows.push(currentLine.trimEnd())
          currentLine = ""
        }

        currentLine += item.str
        lastY = y

        if (item.hasEOL) {
          if (currentLine.trim()) rows.push(currentLine.trimEnd())
          currentLine = ""
        }
      }

      if (currentLine.trim()) rows.push(currentLine.trimEnd())
      pages.push(rows.join("\n").trim())
    }

    // Keep page spacing while cleaning excessive blank runs.
    return pages
      .join("\n\n")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  } finally {
    void loadingTask.destroy()
  }
}
