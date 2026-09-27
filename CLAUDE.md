# Projekt: 3D-modellering för möbelsnickeri

Webbapp för att modellera möbler och mindre träföremål i 3D
och generera kaplistor. Self-hostad, körs i webbläsaren (PWA).

## Stack
- Vite + TypeScript + React
- React Three Fiber + @react-three/drei
- Tailwind CSS (v4, via @tailwindcss/vite) för all styling
- Zustand för state (dokumentet ligger i en store, inte i komponenter)
- IndexedDB för autospar (lokalt först, fungerar offline)
- Synkserver: Hono på Node (server/), en JSON-fil per modell och användare i DATA_DIR.
  Krockar upptäcks med revisionsnummer; ingen version skrivs över tyst.
  I dev körs API:t inuti Vite (server/devPlugin.ts). Driftsätts med Docker.
- PWA via vite-plugin-pwa: service worker bara i produktionsbygget (inte i dev,
  där den skulle störa HMR). Kräver https utom på localhost; Caddy framför servern.
  Ikoner genereras från public/icon.svg med `npm run icons`.
- Inloggning via OIDC mot Pocket ID (https://id.larsabrasha.com), skött av servern
  (server/auth.ts) med signerad session-cookie. Modeller per användare, både på
  servern (DATA_DIR/users/<sub>/) och lokalt (IndexedDB, src/sync/localStore.ts).
  I dev finns ingen inloggning; allt gäller användaren "dev".
- Material och färger (egna material, dolda inbyggda, standardfärger) hör till användaren:
  DATA_DIR/users/<sub>/catalog.json, lokalt i IndexedDB (src/sync/catalogSync.ts). Krockar slås
  ihop post för post. En modell sparar kopior av de egna material den använder (doc.materials).
- Utan konto (gästläget, "Prova utan konto" på startsidan): egen IndexedDB-databas,
  ingen synk, servern tillfrågas inte. Inloggning tar bort valet.
- Utloggad ser startsidan (src/landing) med riktiga modeller, kaplista och kapschema
  räknade med appens egen kod. På /intro visas den för alla, också inloggad (länk i Om Bygg);
  då leder knapparna in i appen.
  Medan 3D-vyn laddas visas stillbilder av möblerna (src/landing/stills, tas om med `npm run stills` när
  en möbel eller studioljuset ändras).
- Ingen CSG-kärna i början; manifold-3d läggs till vid behov
- CLI (cli/, `npm run -s bygg -- help`): ändrar modeller med operationer som körs i appens egen documentStore.
  Nycklar för CLI:t skapas på /auth/cli (server/tokens.ts). Gränser för modeller och konto i src/model/limits.ts
  gäller överallt: när man ritar, vid import, på servern och i CLI:t.
- Servern skickar ut ändringar direkt (/api/events, SSE, server/events.ts); appen synkar då i stället för att
  vänta på nästa runda (60 s). Händelsen säger bara vad som ändrats; hämtningen är en vanlig synkrunda.

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
