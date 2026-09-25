import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createApp } from './app'
import { FileStorage } from './storage'

/**
 * Produktionsserver: API under /api och den byggda appen (dist/) för allt annat.
 * Miljövariabler:
 *   PORT        (8787)
 *   DATA_DIR    (./data)  – här hamnar models/ och trash/
 *   STATIC_DIR  (./dist)
 */
const port = Number(process.env.PORT ?? 8787)
const dataDir = process.env.DATA_DIR ?? './data'
const staticDir = process.env.STATIC_DIR ?? './dist'

const storage = new FileStorage(dataDir)
await storage.init()

const app = createApp({ storage })

// Filer med hash i namnet ändras aldrig; allt annat (index.html, sw.js, manifest)
// måste kontrolleras varje gång, annars fastnar klienter på en gammal version.
app.use('/*', async (c, next) => {
  await next()
  if (c.req.path.startsWith('/api/')) return
  const immutable = c.req.path.startsWith('/assets/') && c.res.status === 200
  c.header('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
})
app.use('/*', serveStatic({ root: staticDir }))
// En asset som saknas (t.ex. gammal hash efter uppdatering) ska ge 404, inte index.html.
app.get('/assets/*', (c) => c.text('Finns inte', 404))
// Appen har en enda sida; övriga okända sökvägar får index.html.
app.get('*', serveStatic({ path: `${staticDir}/index.html` }))

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[bygg] Lyssnar på port ${info.port}. Data i ${dataDir}.`)
})
