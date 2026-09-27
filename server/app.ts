import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { FORMAT_VERSION, migrate, serialize } from '../src/persist/format'
import { cleanCatalog } from '../src/model/catalog'
import type {
  CatalogConflictResponse,
  ConflictResponse,
  PutCatalogRequest,
  PutModelRequest,
  PutModelResponse,
} from '../src/sync/protocol'
import { MODEL_ID_PATTERN } from '../src/sync/protocol'
import type { Auth, User } from './auth'
import type { FileStorage, UserStorages } from './storage'

export interface AppOptions {
  storages: UserStorages
  auth: Auth
}

type Env = { Variables: { user: User; storage: FileStorage } }

const MAX_BODY_BYTES = 20 * 1024 * 1024
const MAX_NAME_LENGTH = 200
const MAX_THUMB_BYTES = 2 * 1024 * 1024

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const isPng = (b: Uint8Array) => b.length > PNG_SIGNATURE.length && PNG_SIGNATURE.every((x, i) => b[i] === x)

/**
 * API:t kräver inloggning (se auth.ts), och varje användare har sina egna modeller.
 * Servern ska stå bakom en omvänd proxy med https (t.ex. Caddy).
 */
export function createApp({ storages, auth }: AppOptions) {
  const app = new Hono<Env>()

  // Ändrande anrop bara från appen själv, inte från en annan sajt (t.ex. en annan subdomän).
  app.use('*', async (c, next) => {
    const origin = c.req.header('origin')
    const safe = c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS'
    if (auth.origin && !safe && origin && origin !== auth.origin) return c.json({ error: 'Fel origin' }, 403)
    return next()
  })

  app.get('/api/health', (c) => c.json({ ok: true, formatVersion: FORMAT_VERSION }))

  app.route('/auth', auth.routes)
  app.all('/auth/*', (c) => c.json({ error: 'Finns inte' }, 404))

  app.use('/api/*', async (c, next) => {
    const user = await auth.user(c)
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

    // Lagra alltid i nuvarande format, men behåll klientens sparningstid.
    const normalized = { ...serialize(parsed.doc), savedAt: typeof file.savedAt === 'string' ? file.savedAt : '' }
    const r = await c.var.storage.put(c.req.param('id'), name.trim(), baseRevision, normalized)
    if (!r.ok) return c.json<ConflictResponse>({ current: r.current }, 409)
    return c.json<PutModelResponse>({ revision: r.revision, updatedAt: r.updatedAt })
  })

  app.delete('/api/models/:id', async (c) => {
    const base = Number(c.req.query('baseRevision'))
    if (!Number.isInteger(base) || base < 1) return c.json({ error: 'baseRevision krävs' }, 400)
    const r = await c.var.storage.delete(c.req.param('id'), base)
    if (!r.ok) return c.json<ConflictResponse>({ current: r.current }, 409)
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
