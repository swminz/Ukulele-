export interface ChordData {
  name: string
  display: string
  frets: [number, number, number, number] // G C E A
  fingers?: [number, number, number, number]
  barre?: { fret: number; from: number; to: number }
  baseFret?: number
}

export const CHORDS: ChordData[] = [
  { name: "C",  display: "C",   frets: [0,0,0,3], fingers: [0,0,0,3] },
  { name: "Cm", display: "Cm",  frets: [0,3,3,3], fingers: [0,3,2,1], barre: { fret: 3, from: 1, to: 3 } },
  { name: "D",  display: "D",   frets: [2,2,2,0], fingers: [2,1,3,0] },
  { name: "Dm", display: "Dm",  frets: [2,2,1,0], fingers: [3,2,1,0] },
  { name: "E",  display: "E",   frets: [4,4,4,2], fingers: [3,2,4,1], baseFret: 2 },
  { name: "Em", display: "Em",  frets: [0,4,3,2], fingers: [0,4,3,2], baseFret: 2 },
  { name: "F",  display: "F",   frets: [2,0,1,0], fingers: [3,0,1,0] },
  { name: "Fm", display: "Fm",  frets: [1,0,1,3], fingers: [1,0,2,4] },
  { name: "G",  display: "G",   frets: [0,2,3,2], fingers: [0,1,3,2] },
  { name: "G7", display: "G7",  frets: [0,2,1,2], fingers: [0,2,1,3] },
  { name: "A",  display: "A",   frets: [2,1,0,0], fingers: [2,1,0,0] },
  { name: "Am", display: "Am",  frets: [2,0,0,0], fingers: [2,0,0,0] },
  { name: "A7", display: "A7",  frets: [0,1,0,0], fingers: [0,1,0,0] },
  { name: "Bb", display: "Bb",  frets: [3,2,1,1], fingers: [4,3,1,1], barre: { fret: 1, from: 2, to: 3 } },
  { name: "B7", display: "B7",  frets: [2,3,2,2], fingers: [1,4,2,3] },
]
