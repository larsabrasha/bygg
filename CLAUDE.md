# Projekt: 3D-modellering för möbelsnickeri

Webbapp för att modellera möbler och mindre träföremål i 3D
och generera kaplistor. Self-hostad, körs i webbläsaren (PWA).

## Stack
- Vite + TypeScript + React
- React Three Fiber + @react-three/drei
- Tailwind CSS (v4, via @tailwindcss/vite) för all styling
- Zustand för state (dokumentet ligger i en store, inte i komponenter)
- IndexedDB för autospar
- Ingen CSG-kärna i början; manifold-3d läggs till vid behov

## Datamodell
Modellering som i SketchUp/Shapr3D: rita en skiss (rektangel) på golvet
eller på en yta, dra ut den med push/pull till en kropp.
Varje kropp sparar sin profil och sitt djup som siffror i en egen frame
(origo + axlar u, v, n), plus namn, material och fiberriktning.
3D-vyn och kaplistan härleds båda från denna data. Kaplistan mäter
L×B×T i varje dels egen riktning (som Fusion 360).

## Arbetssätt
- Små steg; varje feature ska gå att testköra direkt med HMR
- Bevara state över hot reload
- Mått i millimeter överallt
- Ska fungera lika bra på mobil (touch, smal skärm) som på desktop
