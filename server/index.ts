import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createApp } from './app'
import { oidcAuth } from './auth'
import { UserStorages } from './storage'

/**
 * Produktionsserver: API under /api, inloggning under /auth och den byggda appen
 * (dist/) för allt annat. Sidan är öppen; utan inloggning visar den startsidan
 * (src/landing), och modellerna nås bara via API:t, som kräver inloggning. Miljövariabler:
 *   APP_URL             appens publika adress, t.ex. https://bygg.larsabrasha.com
 *   OIDC_ISSUER         (https://id.larsabrasha.com)
 *   OIDC_CLIENT_ID      från OIDC-klienten i Pocket ID
 *   OIDC_CLIENT_SECRET  d:o
 *   SESSION_SECRET      minst 32 slumpade tecken; signerar cookies (openssl rand -hex 32)
 *   PORT                (8787)
 *   DATA_DIR            (./data)  – här hamnar users/<användare>/models, thumbs och trash
 *   STATIC_DIR          (./dist)
 */
const port = Number(process.env.PORT ?? 8787)
const dataDir = process.env.DATA_DIR ?? './data'
const staticDir = process.env.STATIC_DIR ?? './dist'

function required(name: string, check: (v: string) => boolean = (v) => v.length > 0): string {
  const v = process.env[name] ?? ''
  if (!check(v)) {
    console.error(`[bygg] ${name} saknas eller är ogiltig. Servern startar inte utan inloggning.`)
    process.exit(1)
  }
  return v
}

const storages = new UserStorages(dataDir)
const auth = oidcAuth({
  appUrl: required('APP_URL', (v) => URL.canParse(v)),
  issuer: process.env.OIDC_ISSUER || 'https://id.larsabrasha.com',
  clientId: required('OIDC_CLIENT_ID'),
  clientSecret: required('OIDC_CLIENT_SECRET'),
  sessionSecret: required('SESSION_SECRET', (v) => v.length >= 32),
  // Den första som loggar in får modellerna från före inloggningen (se UserStorages).
  onLogin: (user) => storages.for(user.sub),
})

const app = createApp({ storages, auth })

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
