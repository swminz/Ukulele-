# UkePocket

A pocket ukulele companion: tuner, metronome, songs, sheet music, and a chord library. Built as a mobile-first PWA that can run in the browser or be added to the home screen.

Repo: [github.com/swminz/Ukulele-](https://github.com/swminz/Ukulele-)

## Features

**Practice**
- Reference tuner for GCEA ukulele
- Metronome with BPM and accent beat

**Songs**
- Music Notes: import and view PDF sheets
- Songs: write lyrics and chords, or upload audio
- Favourites, search, and local editing

**Chords**
- Built-in chord diagrams (All, Favourites, Recently Viewed)
- Add custom chords from a photo
- Header **+** matches the Songs add control

**Settings**
- Light / dark appearance
- Keep screen awake, haptic feedback, large text
- Backup export and import (data stays on device)

Songs and custom files are stored in the browser with IndexedDB. There is no server-side account.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

```bash
npm run build      # production build
npm run preview    # serve the production build
npm run typecheck  # TypeScript check
```

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS
- IndexedDB (`idb`)
- PDF.js for sheet music
- PWA via `vite-plugin-pwa`

## Development

Work happens on the **`ukulele-1`** branch. Push changes there, not `main`.
