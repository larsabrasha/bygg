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

/**
 * Ingen inloggning: servern är tänkt att nås bara i det egna nätet, med https
 * via en omvänd proxy (t.ex. Caddy).
 */
export function createApp({ storage }: AppOptions) {
  const app = new Hono()

  app.get('/api/health', (c) => c.json({ ok: true, formatVersion: FORMAT_VERSION }))

  app.use('/api/models/:id', async (c, next) => {
    if (!MODEL_ID_PATTERN.test(c.req.param('id'))) return c.json({ error: 'Ogiltigt modell-id' }, 400)
    return next()
  })

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

  app.all('/api/*', (c) => c.json({ error: 'Finns inte' }, 404))

  return app
}
