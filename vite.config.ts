import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'
import { byggApi } from './server/devPlugin'

export default defineConfig({
  plugins: [
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // Appens sidor får index.html från cachen; API:t går alltid till nätet.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [{ urlPattern: /^\/api\//, handler: 'NetworkOnly' }],
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
})
