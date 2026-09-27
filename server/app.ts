import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { streamSSE } from 'hono/streaming'
import { FORMAT_VERSION, migrate, serialize } from '../src/persist/format'
import { cleanCatalog } from '../src/model/catalog'
import { LIMITS, limitError, modelLimitText } from '../src/model/limits'
import type {
  CatalogConflictResponse,
  ConflictResponse,
  PutCatalogRequest,
  PutModelRequest,
  MeApiResponse,
  PutModelResponse,
} from '../src/sync/protocol'
import { MODEL_ID_PATTERN } from '../src/sync/protocol'
import type { Auth, User } from './auth'
import { cliRoutes } from './cliPage'
import { ChangeHub } from './events'
import type { FileStorage, UserStorages } from './storage'
import { RATE, RateLimiter, type TokenStore } from './tokens'

export interface AppOptions {
  storages: UserStorages
  auth: Auth
  /** Nycklar för CLI:t (se tokens.ts). Utan dem går API:t bara att nå med session-cookien. */
  tokens?: TokenStore
  /** Bara i tester. */
  rateLimiter?: RateLimiter
  /** Skickar ändringar till användarens öppna appar (se events.ts). */
  hub?: ChangeHub
  /** Hur ofta strömmen skickar ett livstecken, så att proxyer inte stänger den. */
  heartbeatMs?: number
}

/** tokenId: anropet kom med en nyckel (CLI:t), inte från webbläsaren. */
type Env = { Variables: { user: User; storage: FileStorage; tokenId?: string } }

/** En modell vid gränserna (se model/limits) är några MB; det här ger marginal. */
const MAX_BODY_BYTES = 8 * 1024 * 1024
const MAX_NAME_LENGTH = 200
const MAX_THUMB_BYTES = 2 * 1024 * 1024

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const isPng = (b: Uint8Array) => b.length > PNG_SIGNATURE.length && PNG_SIGNATURE.every((x, i) => b[i] === x)

/**
 * API:t kräver inloggning (se auth.ts), och varje användare har sina egna modeller.
 * Servern ska stå bakom en omvänd proxy med https (t.ex. Caddy).
 */
export function createApp({
  storages,
  auth,
  tokens,
  rateLimiter = new RateLimiter(),
  hub = new ChangeHub(),
  heartbeatMs = 25_000,
}: AppOptions) {
  const app = new Hono<Env>()
  /** Fliken som gjorde anropet, om den sa det. Bara ett id; det används aldrig som något annat. */
  const clientOf = (c: Context<Env>) => {
    const v = c.req.header('x-bygg-client')
    return v && /^[0-9a-f-]{36}$/.test(v) ? v : undefined
  }

  // Ändrande anrop bara från appen själv, inte från en annan sajt (t.ex. en annan subdomän).
  app.use('*', async (c, next) => {
    const origin = c.req.header('origin')
    const safe = c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS'
    if (auth.origin && !safe && origin && origin !== auth.origin) return c.json({ error: 'Fel origin' }, 403)
    return next()
  })

  app.get('/api/health', (c) => c.json({ ok: true, formatVersion: FORMAT_VERSION }))

  if (tokens) app.route('/auth/cli', cliRoutes(auth, tokens))
  app.route('/auth', auth.routes)
  app.all('/auth/*', (c) => c.json({ error: 'Finns inte' }, 404))

  app.use('/api/*', async (c, next) => {
    const bearer = /^Bearer (.+)$/i.exec(c.req.header('authorization') ?? '')?.[1]
    let user: User | null
    if (bearer !== undefined) {
      const t = tokens ? await tokens.verify(bearer.trim()) : null
      if (!t) return c.json({ error: 'Ogiltig eller utgången nyckel' }, 401)
      // Per användare, inte per nyckel: fler nycklar ger inte fler anrop.
      const wait = rateLimiter.take(t.sub, !['GET', 'HEAD'].includes(c.req.method))
      if (wait) {
        c.header('retry-after', String(wait))
        return c.json({ error: `För många anrop. Försök igen om ${wait} s.` }, 429)
      }
      user = { sub: t.sub, name: t.name }
      c.set('tokenId', t.tokenId)
    } else user = await auth.user(c)
    if (!user) return c.json({ error: 'Inte inloggad' }, 401)
    // Klienten säger vems modeller den har; har någon annan loggat in i en annan flik
    // ska den inte synka in dem i fel konto.
    const expected = c.req.header('x-bygg-user')
    if (expected !== undefined && expected !== user.sub)
      return c.json({ error: 'Inloggad som en annan användare' }, 401)
    c.set('user', user)
    c.set('storage', await storages.for(user.sub))
    return next()
  })

  const checkId: Parameters<typeof app.use>[1] = async (c, next) => {
    if (!MODEL_ID_PATTERN.test(c.req.param('id') ?? '')) return c.json({ error: 'Ogiltigt modell-id' }, 400)
    return next()
  }
  app.use('/api/models/:id', checkId)
  app.use('/api/models/:id/*', checkId)

  app.get('/api/models', async (c) => c.json(await c.var.storage.list()))

  // Ändringar direkt, medan appen är öppen. Varje händelse är en rad JSON (ChangeEvent).
  app.get('/api/events', (c) => {
    const sub = c.var.user.sub
    let unsubscribe: (() => void) | null = null
    const queue: string[] = []
    let wake: (() => void) | null = null
    unsubscribe = hub.subscribe(sub, (e) => {
      queue.push(JSON.stringify(e))
      wake?.()
    })
    if (!unsubscribe) return c.json({ error: 'För många öppna flikar' }, 429)
    return streamSSE(c, async (stream) => {
      stream.onAbort(() => {
        unsubscribe?.()
        wake?.()
      })
      await stream.writeSSE({ event: 'ready', data: '{}', retry: 5000 })
      while (!stream.aborted && !stream.closed) {
        let timer: ReturnType<typeof setTimeout> | undefined
        if (queue.length === 0)
          await new Promise<void>((resolve) => {
            wake = resolve
            timer = setTimeout(resolve, heartbeatMs)
          })
        clearTimeout(timer)
        wake = null
        if (stream.aborted) break
        if (queue.length === 0) await stream.write(': \n\n')
        while (queue.length) await stream.writeSSE({ event: 'change', data: queue.shift()! })
      }
      unsubscribe?.()
    })
  })

  // Vem man är och vad som gäller: gränserna och hur många modeller man har.
  app.get('/api/me', async (c) =>
    c.json<MeApiResponse>({
      sub: c.var.user.sub,
      name: c.var.user.name,
      via: c.var.tokenId ? 'token' : 'session',
      models: await c.var.storage.count(),
      limits: LIMITS,
      rate: RATE,
    }),
  )

  // Nyckeln tar bort sig själv (bygg logout). Andra nycklar tas bort på /auth/cli.
  app.delete('/api/tokens/current', async (c) => {
    if (!c.var.tokenId || !tokens) return c.json({ error: 'Anropet gjordes inte med en nyckel' }, 400)
    await tokens.revoke(c.var.user.sub, c.var.tokenId)
    return c.body(null, 204)
  })

  // Användarens material och färger. Saknas de svarar servern 404, och klienten laddar upp sina.
  app.get('/api/catalog', async (c) => {
    const current = await c.var.storage.getCatalog()
    return current ? c.json(current) : c.json({ error: 'Finns inte' }, 404)
  })

  app.put('/api/catalog', bodyLimit({ maxSize: MAX_BODY_BYTES }), async (c) => {
    let body: PutCatalogRequest
    try {
      body = await c.req.json<PutCatalogRequest>()
    } catch {
      return c.json({ error: 'Ogiltig JSON' }, 400)
    }
    const { baseRevision, catalog } = body ?? {}
    if (baseRevision !== null && !(Number.isInteger(baseRevision) && baseRevision > 0))
      return c.json({ error: 'Ogiltig baseRevision' }, 400)
    // Samma kontroll som när klienten läser listan: det som inte ser rimligt ut släpps.
    const r = await c.var.storage.putCatalog(baseRevision, cleanCatalog(catalog))
    if (!r.ok) return c.json<CatalogConflictResponse>({ current: r.current }, 409)
    hub.publish(c.var.user.sub, { kind: 'catalog', revision: r.revision }, clientOf(c))
    return c.json<PutModelResponse>({ revision: r.revision, updatedAt: r.updatedAt })
  })

  app.get('/api/models/:id', async (c) => {
    const m = await c.var.storage.get(c.req.param('id'))
    return m ? c.json(m) : c.json({ error: 'Finns inte' }, 404)
  })

  app.put('/api/models/:id', bodyLimit({ maxSize: MAX_BODY_BYTES }), async (c) => {
    let body: PutModelRequest
    try {
      body = await c.req.json<PutModelRequest>()
    } catch {
      return c.json({ error: 'Ogiltig JSON' }, 400)
    }
    const { name, baseRevision, file } = body ?? {}
    if (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME_LENGTH)
      return c.json({ error: 'Ogiltigt namn' }, 400)
    if (baseRevision !== null && !(Number.isInteger(baseRevision) && baseRevision > 0))
      return c.json({ error: 'Ogiltig baseRevision' }, 400)
    // Samma kontroll och konvertering som när klienten läser in en fil.
    const parsed = migrate(file)
    if (!parsed.ok) return c.json({ error: `Ogiltig modell: ${parsed.reason}` }, 400)
    // Samma gränser som i appen och i CLI:t.
    const tooBig = limitError(parsed.doc)
    if (tooBig) return c.json({ error: tooBig }, 400)

    // Lagra alltid i nuvarande format, men behåll klientens sparningstid.
    const normalized = { ...serialize(parsed.doc), savedAt: typeof file.savedAt === 'string' ? file.savedAt : '' }
    const r = await c.var.storage.put(c.req.param('id'), name.trim(), baseRevision, normalized, LIMITS.models)
    if (!r.ok && 'full' in r) return c.json({ error: modelLimitText() }, 403)
    if (!r.ok) return c.json<ConflictResponse>({ current: r.current }, 409)
    hub.publish(c.var.user.sub, { kind: 'model', id: c.req.param('id'), revision: r.revision }, clientOf(c))
    return c.json<PutModelResponse>({ revision: r.revision, updatedAt: r.updatedAt })
  })

  app.delete('/api/models/:id', async (c) => {
    const base = Number(c.req.query('baseRevision'))
    if (!Number.isInteger(base) || base < 1) return c.json({ error: 'baseRevision krävs' }, 400)
    const r = await c.var.storage.delete(c.req.param('id'), base)
    if (!r.ok) return c.json<ConflictResponse>({ current: r.current }, 409)
    hub.publish(c.var.user.sub, { kind: 'delete', id: c.req.param('id') }, clientOf(c))
    return c.body(null, 204)
  })

  // Bilden av modellen till startvyn, som PNG. Den enhet som sparar modellen tar
  // bilden och laddar upp den, så att andra enheter får den utan att öppna modellen.
  app.get('/api/models/:id/thumb', async (c) => {
    const png = await c.var.storage.getThumb(c.req.param('id'))
    if (!png) return c.json({ error: 'Finns inte' }, 404)
    return c.body(new Uint8Array(png), 200, { 'content-type': 'image/png', 'cache-control': 'no-cache' })
  })

  app.put('/api/models/:id/thumb', bodyLimit({ maxSize: MAX_THUMB_BYTES }), async (c) => {
    const png = new Uint8Array(await c.req.arrayBuffer())
    if (!isPng(png)) return c.json({ error: 'Bilden ska vara PNG' }, 400)
    const ok = await c.var.storage.putThumb(c.req.param('id'), png)
    return ok ? c.body(null, 204) : c.json({ error: 'Finns inte' }, 404)
  })

  app.all('/api/*', (c) => c.json({ error: 'Finns inte' }, 404))

  return app
}
