import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, type Plugin } from 'vitest/config'
import { byggApi } from './server/devPlugin'
import { attributions } from './scripts/attributions'
import { gitInfo } from './scripts/buildInfo'
import { WORDMARK, WORDMARK_WIDTH } from './src/panel/wordmark'

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

/**
 * Loggan i startbilden i index.html (som visas medan appen laddas), från samma bana som
 * Logo.tsx, så att den bara finns på ett ställe.
 */
function splashWordmark(): Plugin {
  const height = 44
  const svg =
    `<svg role="img" aria-label="Bygg" viewBox="0 0 ${WORDMARK_WIDTH} 100" height="${height}" ` +
    `width="${Math.round((height * WORDMARK_WIDTH) / 100)}" fill="currentColor"><path d="${WORDMARK}"/></svg>`
  return {
    name: 'splash-wordmark',
    transformIndexHtml: (html) => html.replace(/<!-- wordmark:.*?-->/, svg),
  }
}

// npm run dev:vr (mode vr): https med ett självsignerat certifikat. WebXR kräver https
// utom på localhost, och headsetet sitter på en annan dator. Webbläsaren varnar för
// certifikatet första gången. npm run preview:vr: produktionsbygget över https, med
// samma certifikat, för att prova hur fort det går i VR (dev-läget i React är långsammare).
// Övriga lägen är http.
export default defineConfig(({ mode }) => {
  // Licenserna för det som hamnar i bygget (Om Bygg), också från Web Workers.
  const git = gitInfo(fileURLToPath(new URL('.', import.meta.url)))
  const builtAt = new Date()
  const licenses = attributions(
    `Version ${git.version ? `${git.version} (${git.commit?.slice(0, 7) ?? 'okänd commit'})` : (git.commit?.slice(0, 7) ?? 'okänd')}${git.dirty ? ' med ändringar som inte är incheckade' : ''}, byggd ${builtAt.toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' })}.`,
  )
  return {
    // Vilken version som körs, för Om Bygg (src/panel/AboutSheet.tsx).
    define: {
      'import.meta.env.BUILD_COMMIT': JSON.stringify(git.commit ?? ''),
      'import.meta.env.BUILD_DIRTY': JSON.stringify(git.dirty),
      'import.meta.env.BUILD_VERSION': JSON.stringify(git.version ?? ''),
    },
    worker: { plugins: () => [licenses.worker()] },
    // Egen cache för förbyggda beroenden: läget ingår i dess nyckel, och med samma katalog
    // byggde dev:vr och dev om dem åt varandra (öppna sidor fick "Outdated Optimize Dep").
    cacheDir: mode === 'vr' ? 'node_modules/.vite-vr' : undefined,
    // En enda three.js: VR-emulatorn i dev (@iwer/devui) har en egen, äldre kopia, och två
    // kopior i samma sida ger fel när den ena ritar den andras material.
    resolve: { dedupe: ['three'] },
    plugins: [
      mode === 'vr' && basicSsl({ name: 'bygg-dev' }),
      noXrEmulator(),
      splashWordmark(),
      licenses.app,
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
          // mjs: pdf.js-workern (PDF-visaren i ritningen). html: också licenser.html (Om Bygg).
          globPatterns: ['**/*.{js,mjs,css,html,svg,png,webp,ico,webmanifest,wasm}'],
          // The CLI (scripts/buildCli.mjs) is for the terminal, not the app.
          globIgnores: ['cli/**'],
          // Appens sidor får index.html från cachen; API:t och inloggningen går alltid till nätet.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/auth\//, /^\/install\.sh$/, /^\/cli\//],
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
  }
})
