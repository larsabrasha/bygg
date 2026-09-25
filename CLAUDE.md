# Projekt: 3D-modellering för möbelsnickeri

Webbapp för att modellera möbler och mindre träföremål i 3D
och generera kaplistor. Self-hostad, körs i webbläsaren (PWA).

## Stack
- Vite + TypeScript + React
- React Three Fiber + @react-three/drei
- Tailwind CSS (v4, via @tailwindcss/vite) för all styling
- Zustand för state (dokumentet ligger i en store, inte i komponenter)
- IndexedDB för autospar (lokalt först, fungerar offline)
- Synkserver: Hono på Node (server/), en JSON-fil per modell i DATA_DIR.
  Krockar upptäcks med revisionsnummer; ingen version skrivs över tyst.
  I dev körs API:t inuti Vite (server/devPlugin.ts). Driftsätts med Docker.
- PWA via vite-plugin-pwa: service worker bara i produktionsbygget (inte i dev,
  där den skulle störa HMR). Kräver https utom på localhost; Caddy framför servern.
  Ikoner genereras från public/icon.svg med `npm run icons`.
- Ingen inloggning: appen används bara av en person i det egna nätet.
- Ingen CSG-kärna i början; manifold-3d läggs till vid behov

## Datamodell
Modellering som i SketchUp/Shapr3D: rita en skiss (rektangel) på golvet
eller på en yta, dra ut den med push/pull till en kropp.
Varje kropp sparar sin profil och sitt djup som siffror i en egen frame
(origo + axlar u, v, n), plus namn, material och fiberriktning.
Form (PartDef) och placering (Instance) är separata, så att länkade
kopior delar form. Mått kan styras av namngivna parametrar (uttryck).
Sparformatet har ett versionsnummer (src/persist/format.ts).
3D-vyn och kaplistan härleds båda från denna data. Kaplistan mäter
L×B×T i varje dels egen riktning (som Fusion 360).

## Arbetssätt
- Små steg; varje feature ska gå att testköra direkt med HMR
- Bevara state över hot reload
- Mått i millimeter överallt
- Ska fungera lika bra på mobil (touch, smal skärm) som på desktop
