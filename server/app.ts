import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { FORMAT_VERSION, migrate, serialize } from '../src/persist/format'
import type { ConflictResponse, PutModelRequest, PutModelResponse } from '../src/sync/protocol'
import { MODEL_ID_PATTERN } from '../src/sync/protocol'
import type { FileStorage } from './storage'

export interface AppOptions {
  storage: FileStorage
}

const MAX_BODY_BYTES = 20 * 1024 * 1024
const MAX_NAME_LENGTH = 200
const MAX_THUMB_BYTES = 2 * 1024 * 1024

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const isPng = (b: Uint8Array) => b.length > PNG_SIGNATURE.length && PNG_SIGNATURE.every((x, i) => b[i] === x)

/**
 * Ingen inloggning: servern är tänkt att nås bara i det egna nätet, med https
 * via en omvänd proxy (t.ex. Caddy).
 */
export function createApp({ storage }: AppOptions) {
  const app = new Hono()

  app.get('/api/health', (c) => c.json({ ok: true, formatVersion: FORMAT_VERSION }))

  const checkId: Parameters<typeof app.use>[1] = async (c, next) => {
    if (!MODEL_ID_PATTERN.test(c.req.param('id') ?? '')) return c.json({ error: 'Ogiltigt modell-id' }, 400)
    return next()
  }
  app.use('/api/models/:id', checkId)
  app.use('/api/models/:id/*', checkId)

  app.get('/api/models', async (c) => c.json(await storage.list()))

  app.get('/api/models/:id', async (c) => {
    const m = await storage.get(c.req.param('id'))
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
    const r = await storage.put(c.req.param('id'), name.trim(), baseRevision, normalized)
    if (!r.ok) return c.json<ConflictResponse>({ current: r.current }, 409)
    return c.json<PutModelResponse>({ revision: r.revision, updatedAt: r.updatedAt })
  })

  app.delete('/api/models/:id', async (c) => {
    const base = Number(c.req.query('baseRevision'))
    if (!Number.isInteger(base) || base < 1) return c.json({ error: 'baseRevision krävs' }, 400)
    const r = await storage.delete(c.req.param('id'), base)
    if (!r.ok) return c.json<ConflictResponse>({ current: r.current }, 409)
    return c.body(null, 204)
  })

  // Bilden av modellen till startvyn, som PNG. Den enhet som sparar modellen tar
  // bilden och laddar upp den, så att andra enheter får den utan att öppna modellen.
  app.get('/api/models/:id/thumb', async (c) => {
    const png = await storage.getThumb(c.req.param('id'))
    if (!png) return c.json({ error: 'Finns inte' }, 404)
    return c.body(new Uint8Array(png), 200, { 'content-type': 'image/png', 'cache-control': 'no-cache' })
  })

  app.put('/api/models/:id/thumb', bodyLimit({ maxSize: MAX_THUMB_BYTES }), async (c) => {
    const png = new Uint8Array(await c.req.arrayBuffer())
    if (!isPng(png)) return c.json({ error: 'Bilden ska vara PNG' }, 400)
    const ok = await storage.putThumb(c.req.param('id'), png)
    return ok ? c.body(null, 204) : c.json({ error: 'Finns inte' }, 404)
  })

  app.all('/api/*', (c) => c.json({ error: 'Finns inte' }, 404))

  return app
}
