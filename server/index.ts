import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync, readFileSync } from 'node:fs'
import type { Context } from 'hono'
import { createApp } from './app'
import { noAuth, oidcAuth } from './auth'
import { withAppUrl } from './indexHtml'
import { UserStorages } from './storage'
import { TokenStore } from './tokens'

/**
 * Produktionsserver: API under /api, inloggning under /auth och den byggda appen
 * (dist/) för allt annat. Sidan är öppen; utan inloggning visar den startsidan
 * (src/landing), och modellerna nås bara via API:t, som kräver inloggning.
 *
 * Utan OIDC_CLIENT_ID, OIDC_CLIENT_SECRET och SESSION_SECRET har servern ingen inloggning:
 * appen körs bara utan konto (allt i webbläsaren) och API:t svarar alltid 401. Anges
 * någon av dem måste alla finnas. Miljövariabler:
 *   APP_URL             appens publika adress, t.ex. https://bygg.larsabrasha.com (krävs med inloggning)
 *   OIDC_ISSUER         (https://id.larsabrasha.com)
 *   OIDC_CLIENT_ID      från OIDC-klienten i Pocket ID
 *   OIDC_CLIENT_SECRET  d:o
 *   SESSION_SECRET      minst 32 slumpade tecken; signerar cookies (openssl rand -hex 32)
 *   PORT                (8787)
 *   DATA_DIR            (./data)  – här hamnar users/<användare>/models, thumbs och trash
 *                                 (papperskorgen, som töms efter TRASH_DAYS dagar),
 *                                 och CLI:ts nycklar (tokens.json, bara hashar)
 *   STATIC_DIR          (./dist)
 */
const port = Number(process.env.PORT ?? 8787)
const dataDir = process.env.DATA_DIR ?? './data'
const staticDir = process.env.STATIC_DIR ?? './dist'

function required(name: string, check: (v: string) => boolean = (v) => v.length > 0): string {
  const v = process.env[name] ?? ''
  if (!check(v)) {
    console.error(
      `[bygg] ${name} saknas eller är ogiltig. Ange alla inställningar för inloggningen, eller ingen för att köra utan.`,
    )
    process.exit(1)
  }
  return v
}

const storages = new UserStorages(dataDir)
const withLogin = ['OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'SESSION_SECRET'].some((name) => process.env[name])
const appUrl = process.env.APP_URL
const auth = withLogin
  ? oidcAuth({
      appUrl: required('APP_URL', (v) => URL.canParse(v)),
      issuer: process.env.OIDC_ISSUER || 'https://id.larsabrasha.com',
      clientId: required('OIDC_CLIENT_ID'),
      clientSecret: required('OIDC_CLIENT_SECRET'),
      sessionSecret: required('SESSION_SECRET', (v) => v.length >= 32),
      // Den första som loggar in får modellerna från före inloggningen (se UserStorages).
      onLogin: (user) => storages.for(user.sub),
    })
  : noAuth(appUrl && URL.canParse(appUrl) ? appUrl : undefined)
if (!withLogin) console.log('[bygg] Ingen inloggning: appen körs bara utan konto, och API:t är stängt.')

// Nycklar för CLI:t skapas inloggad på /auth/cli. Utan inloggning finns inga.
const app = createApp({ storages, auth, tokens: withLogin ? new TokenStore(dataDir) : undefined })

// Filer med hash i namnet ändras aldrig; allt annat (index.html, sw.js, manifest)
// måste kontrolleras varje gång, annars fastnar klienter på en gammal version.
app.use('/*', async (c, next) => {
  await next()
  if (c.req.path.startsWith('/api/')) return
  const immutable = c.req.path.startsWith('/assets/') && c.res.status === 200
  c.header('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
})
// index.html med delningsbildens adress absolut (se indexHtml.ts). Utan bygge (ingen fil) som förut.
const indexFile = `${staticDir}/index.html`
const indexHtml = existsSync(indexFile) ? withAppUrl(readFileSync(indexFile, 'utf8'), appUrl) : null
const sendIndex = indexHtml === null ? serveStatic({ path: indexFile }) : (c: Context) => c.html(indexHtml)
app.get('/', sendIndex)
app.get('/index.html', sendIndex)
app.use('/*', serveStatic({ root: staticDir }))
// En asset som saknas (t.ex. gammal hash efter uppdatering) ska ge 404, inte index.html.
app.get('/assets/*', (c) => c.text('Finns inte', 404))
// Appen har en enda sida; övriga okända sökvägar får index.html.
app.get('*', sendIndex)

// Papperskorgen töms på det som legat där i TRASH_DAYS dagar: vid start och sedan två gånger om dygnet.
// (Den rensas också när någon öppnar den, se /api/trash.)
const purgeTrash = () =>
  storages
    .purgeOldTrash()
    .then((n) => n > 0 && console.log(`[bygg] ${n} modeller raderades för gott ur papperskorgen.`))
    .catch((e: unknown) => console.error('[bygg] Kunde inte tömma papperskorgen', e))
void purgeTrash()
setInterval(() => void purgeTrash(), 12 * 60 * 60 * 1000).unref()

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[bygg] Lyssnar på port ${info.port}. Data i ${dataDir}.`)
})
