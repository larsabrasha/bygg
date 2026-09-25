import { getRequestListener } from '@hono/node-server'
import type { Plugin } from 'vite'
import { createApp } from './app'
import { FileStorage } from './storage'

/**
 * Kör API:t inuti Vites dev-server, så att `npm run dev` räcker och appen och
 * API:t delar port. Data hamnar i ./data (samma som produktionsserverns standard).
 */
export function byggApi(): Plugin {
  return {
    name: 'bygg-api',
    apply: 'serve',
    async configureServer(server) {
      // Vitest startar också en Vite-server; där ska inget API eller ./data skapas.
      if (process.env.VITEST) return
      const storage = new FileStorage(process.env.DATA_DIR ?? './data')
      await storage.init()
      const listener = getRequestListener(createApp({ storage }).fetch)
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/api/')) void listener(req, res)
        else next()
      })
    },
  }
}
