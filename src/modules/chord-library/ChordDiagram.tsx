import type { ChordData } from "./chords"

interface Props {
  chord: ChordData
  size?: "sm" | "md" | "lg"
}

const STRING_LABELS = ["G", "C", "E", "A"]
const COLORS = { dot: "var(--primary)", open: "none", barre: "var(--primary)", text: "var(--primary-foreground)" }

export function ChordDiagram({ chord, size = "md" }: Props) {
  const scale = size === "sm" ? 0.8 : size === "lg" ? 1.3 : 1
  const W = Math.round(110 * scale)
  const H = Math.round(130 * scale)

  // Layout constants (at scale=1)
  const padL = 14
  const padT = 22
  const strSpacing = 24
  const fretSpacing = 22
  const numFrets = 4
  const numStrings = 4
  const dotR = 7

  const svgW = padL * 2 + strSpacing * (numStrings - 1)
  const svgH = padT + fretSpacing * numFrets + 18

  const baseFret = chord.baseFret ?? 1
  const isOpenPosition = baseFret === 1

  // x position of each string (0 = G, 3 = A)
  const sx = (si: number) => padL + si * strSpacing
  // y position of center of fret slot
  const fy = (fi: number) => padT + (fi - 0.5) * fretSpacing

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${svgW} ${svgH}`}
      aria-label={`${chord.display} chord diagram`}
    >
      {/* Base fret label */}
      {!isOpenPosition && (
        <text x={svgW - 2} y={padT + 4} fontSize={8} fill="var(--text-tertiary)" textAnchor="end">
          {baseFret}fr
        </text>
      )}

      {/* Nut or top border */}
      {isOpenPosition ? (
        <rect x={padL - 1} y={padT - 4} width={strSpacing * (numStrings - 1) + 2} height={4} rx={1} fill="var(--foreground)" />
      ) : (
        <line x1={padL} y1={padT - 2} x2={padL + strSpacing * (numStrings - 1)} y2={padT - 2} stroke="var(--muted-foreground)" strokeWidth={1.5} opacity={0.4} />
      )}

      {/* Fret lines */}
      {Array.from({ length: numFrets + 1 }).map((_, fi) => (
        <line
          key={fi}
          x1={padL}
          y1={padT + fi * fretSpacing}
          x2={padL + strSpacing * (numStrings - 1)}
          y2={padT + fi * fretSpacing}
          stroke="var(--muted-foreground)" opacity={0.15}
          strokeWidth={fi === 0 && isOpenPosition ? 0 : 1}
        />
      ))}

      {/* String lines */}
      {Array.from({ length: numStrings }).map((_, si) => (
        <line
          key={si}
          x1={sx(si)}
          y1={padT}
          x2={sx(si)}
          y2={padT + fretSpacing * numFrets}
          stroke="var(--muted-foreground)" opacity={0.3}
          strokeWidth={1}
        />
      ))}

      {/* Barre bar */}
      {chord.barre && (() => {
        const barreRelFret = chord.barre.fret - baseFret + 1
        if (barreRelFret < 1 || barreRelFret > numFrets) return null
        const y = fy(barreRelFret)
        const x1 = sx(chord.barre.from)
        const x2 = sx(chord.barre.to)
        return (
          <rect
            key="barre"
            x={x1 - dotR}
            y={y - dotR}
            width={x2 - x1 + dotR * 2}
            height={dotR * 2}
            rx={dotR}
            fill={COLORS.barre}
            opacity={0.85}
          />
        )
      })()}

      {/* Finger dots */}
      {chord.frets.map((fret, si) => {
        if (fret === 0) return null // open
        const relFret = fret - baseFret + 1
        if (relFret < 1 || relFret > numFrets) return null
        const x = sx(si)
        const y = fy(relFret)
        const fingerNum = chord.fingers?.[si] ?? 0
        return (
          <g key={si}>
            <circle cx={x} cy={y} r={dotR} fill={COLORS.dot} />
            {fingerNum > 0 && (
              <text x={x} y={y + 3.5} fontSize={8} textAnchor="middle" fill={COLORS.text} fontWeight="bold">
                {fingerNum}
              </text>
            )}
          </g>
        )
      })}

      {/* Open string indicators (above nut) */}
      {chord.frets.map((fret, si) => {
        if (fret !== 0) return null
        return (
          <circle
            key={si}
            cx={sx(si)}
            cy={padT - 10}
            r={4}
            fill="none"
            stroke="var(--muted-foreground)" opacity={0.5}
            strokeWidth={1.2}
          />
        )
      })}

      {/* String labels at bottom */}
      {STRING_LABELS.map((label, si) => (
        <text
          key={si}
          x={sx(si)}
          y={svgH - 2}
          fontSize={8}
          textAnchor="middle"
          fill="var(--text-tertiary)"
        >
          {label}
        </text>
      ))}
    </svg>
  )
}
