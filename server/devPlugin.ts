import { getRequestListener } from '@hono/node-server'
import type { Connect, Plugin } from 'vite'
import { createApp } from './app'
import { FileStorage } from './storage'

/**
 * Kör API:t inuti Vites dev-server, så att `npm run dev` räcker och appen och
 * API:t delar port. Data hamnar i ./data (samma som produktionsserverns standard).
 * Också i förhandsvisningen av produktionsbygget (`npm run preview:vr`), så att
 * synken fungerar när bygget provas i VR.
 */
export function byggApi(): Plugin {
  const mount = async (middlewares: Connect.Server) => {
    const storage = new FileStorage(process.env.DATA_DIR ?? './data')
    await storage.init()
    const listener = getRequestListener(createApp({ storage }).fetch)
    middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/api/')) void listener(req, res)
      else next()
    })
  }
  return {
    name: 'bygg-api',
    apply: 'serve',
    async configureServer(server) {
      // Vitest startar också en Vite-server; där ska inget API eller ./data skapas.
      if (process.env.VITEST) return
      await mount(server.middlewares)
    },
    async configurePreviewServer(server) {
      await mount(server.middlewares)
    },
  }
}
