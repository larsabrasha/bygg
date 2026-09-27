# Project: 3D modelling for furniture making

Web app for modelling furniture and small wooden objects in 3D
and generating cut lists. Self-hosted, runs in the browser (PWA).

## Stack
- Vite + TypeScript + React
- React Three Fiber + @react-three/drei
- Tailwind CSS (v4, via @tailwindcss/vite) for all styling
- Zustand for state (the document lives in a store, not in components)
- IndexedDB for autosave (local first, works offline)
- Sync server: Hono on Node (server/), one JSON file per model and user in DATA_DIR.
  Conflicts are detected with revision numbers; no version is silently overwritten.
  In dev the API runs inside Vite (server/devPlugin.ts). Deployed with Docker.
- PWA via vite-plugin-pwa: service worker only in the production build (not in dev,
  where it would interfere with HMR). Requires https except on localhost; Caddy in front of the server.
  Icons are generated from public/icon.svg with `npm run icons`.
- Sign-in via OIDC against Pocket ID (https://id.larsabrasha.com), handled by the server
  (server/auth.ts) with a signed session cookie. Models per user, both on
  the server (DATA_DIR/users/<sub>/) and locally (IndexedDB, src/sync/localStore.ts).
  In dev there is no sign-in; everything belongs to the user "dev".
- Materials and colours (custom materials, hidden built-ins, default colours) belong to the user:
  DATA_DIR/users/<sub>/catalog.json, locally in IndexedDB (src/sync/catalogSync.ts). Conflicts are merged
  entry by entry. A model stores copies of the custom materials it uses (doc.materials).
- Without an account (guest mode, "Prova utan konto" on the landing page): its own IndexedDB database,
  no sync, the server is never asked. Signing in removes the choice.
- Signed out, the user sees the landing page (src/landing) with real models, cut list and cutting plan
  computed with the app's own code. On /intro it is shown to everyone, also when signed in (link in "Om Bygg");
  then the buttons lead into the app.
  While the 3D view loads, still images of the furniture are shown (src/landing/stills, retaken with `npm run stills`
  when a piece of furniture or the studio lighting changes; a test says when the furniture has changed). The same script takes
  the share image (public/delningsbild.jpg). The screenshots of the app (src/landing/app) are taken with `npm run appshots`.
- No CSG kernel at first; manifold-3d is added when needed
- CLI (cli/, `npm run -s bygg -- help`): edits models with operations that run in the app's own documentStore.
  Keys for the CLI are created on /auth/cli (server/tokens.ts). Limits for models and accounts in src/model/limits.ts
  apply everywhere: when drawing, on import, on the server and in the CLI.
- The server pushes changes immediately (/api/events, SSE, server/events.ts); the app then syncs instead of
  waiting for the next round (60 s). The event only says what changed; the fetch is an ordinary sync round.

## Data model
Modelling as in SketchUp/Shapr3D: draw a sketch (rectangle) on the floor
or on a face, extrude it with push/pull into a body.
Each body stores its profile and its depth as numbers in its own frame
(origin + axes u, v, n), plus name, material and grain direction.
Shape (PartDef) and placement (Instance) are separate, so that linked
copies share shape. Dimensions can be driven by named parameters (expressions).
The save format has a version number (src/persist/format.ts).
The 3D view and the cut list are both derived from this data. The cut list measures
L×W×T in each part's own direction (like Fusion 360).

## Way of working
- Small steps; every feature should be testable right away with HMR
- Preserve state across hot reload
- Millimetres everywhere
- Must work as well on mobile (touch, narrow screen) as on desktop
- README.md, CLAUDE.md, files in .claude/ and other repo docs and config files are written in English.
  The app's UI texts are in Swedish.
