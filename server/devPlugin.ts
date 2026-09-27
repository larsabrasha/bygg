import { getRequestListener } from '@hono/node-server'
import type { Connect, Plugin } from 'vite'
import { createApp } from './app'
import { devAuth } from './auth'
import { UserStorages } from './storage'
import { TokenStore } from './tokens'

/**
 * Kör API:t inuti Vites dev-server, så att `npm run dev` räcker och appen och
 * API:t delar port. Data hamnar i ./data (samma som produktionsserverns standard).
 * Ingen inloggning här: allt gäller dev-användaren (./data/users/dev).
 * Också i förhandsvisningen av produktionsbygget (`npm run preview:vr`), så att
 * synken fungerar när bygget provas i VR.
 */
export function byggApi(): Plugin {
  const mount = async (middlewares: Connect.Server) => {
    const dataDir = process.env.DATA_DIR ?? './data'
    const storages = new UserStorages(dataDir)
    // CLI:t behöver ingen nyckel mot dev-servern, men nycklar går att prova (/auth/cli).
    const app = createApp({ storages, auth: devAuth(), tokens: new TokenStore(dataDir) })
    const listener = getRequestListener(app.fetch)
    middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/api/') || req.url?.startsWith('/auth/')) void listener(req, res)
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
