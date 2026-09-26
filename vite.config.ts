import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, type Plugin } from 'vitest/config'
import { byggApi } from './server/devPlugin'

/**
 * @pmndrs/xr laddar sin emulator med import('./emulate.js') även när den är avslagen
 * (emulate: false i xrStore). Den drar med sig rum på flera MB, som service workern
 * annars förcachar. Appen har en egen emulator i dev (src/scene/xr/emulator.ts).
 */
function noXrEmulator(): Plugin {
  const stub = '\0no-xr-emulator'
  return {
    name: 'no-xr-emulator',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './emulate.js' && importer?.replaceAll('\\', '/').includes('/@pmndrs/xr/')) return stub
    },
    load(id) {
      if (id === stub) return "export function emulate() { throw new Error('XR-emulatorn är inte med') }"
    },
  }
}

// npm run dev:vr (mode vr): https med ett självsignerat certifikat. WebXR kräver https
// utom på localhost, och headsetet sitter på en annan dator. Webbläsaren varnar för
// certifikatet första gången. Övriga lägen är http, också förhandsvisningen i dev.
export default defineConfig(({ mode }) => ({
  // Egen cache för förbyggda beroenden: läget ingår i dess nyckel, och med samma katalog
  // byggde dev:vr och dev om dem åt varandra (öppna sidor fick "Outdated Optimize Dep").
  cacheDir: mode === 'vr' ? 'node_modules/.vite-vr' : undefined,
  // En enda three.js: VR-emulatorn i dev (@iwer/devui) har en egen, äldre kopia, och två
  // kopior i samma sida ger fel när den ena ritar den andras material.
  resolve: { dedupe: ['three'] },
  plugins: [
    mode === 'vr' && basicSsl({ name: 'bygg-dev' }),
    noXrEmulator(),
    react(),
    tailwindcss(),
    byggApi(),
    VitePWA({
      // Ny version installeras i bakgrunden men aktiveras först när användaren väljer
      // "Ladda om", så att en pågående operation inte avbryts (se src/pwa.ts).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Bygg – möbler i 3D',
        short_name: 'Bygg',
        description: 'Modellera möbler i 3D och ta ut kaplistor.',
        lang: 'sv',
        start_url: '/',
        display: 'standalone',
        background_color: '#f2f1ee',
        theme_color: '#fbfaf8',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // wasm: manifold-3d (lägg till och skär ut) ska fungera offline också; webp: trätexturerna;
        // mjs: pdf.js-workern (PDF-visaren i ritningen).
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webp,ico,webmanifest,wasm}'],
        // Appens sidor får index.html från cachen; API:t går alltid till nätet.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          { urlPattern: /^\/api\//, handler: 'NetworkOnly' },
          // Handkontrollernas modeller i VR (WebXR Input Profiles): hämtas första gången, sedan offline.
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@webxr-input-profiles\//,
            handler: 'CacheFirst',
            options: { cacheName: 'xr-controllers', expiration: { maxEntries: 20 } },
          },
        ],
        cleanupOutdatedCaches: true,
        // Three.js gör huvudbunten större än standardgränsen på 2 MiB för förcachning.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      // Ingen service worker i dev: den skulle cacha bort HMR.
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'node',
  },
}))
