import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GROUND_FRAME } from '../src/model/frame'
import { LIMITS } from '../src/model/limits'
import { serialize } from '../src/persist/format'
import { createApp } from './app'
import { devAuth } from './auth'
import { UserStorages } from './storage'
import { MAX_TOKENS_PER_USER, RATE, RateLimiter, TokenStore } from './tokens'

const ID = '11111111-2222-4333-8444-555555555555'
const emptyDoc = { sketches: [], defs: [], instances: [], params: [] }
const file = serialize(emptyDoc, new Date('2026-09-25T10:00:00Z'))
const user = { sub: 'anna', name: 'Anna' }

let dir: string
let now: number
let tokens: TokenStore
let app: ReturnType<typeof createApp>

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'bygg-tokens-'))
  now = Date.parse('2026-09-27T12:00:00Z')
  tokens = new TokenStore(dir, () => new Date(now))
  app = createApp({
    storages: new UserStorages(dir),
    auth: devAuth(),
    tokens,
    rateLimiter: new RateLimiter(() => now),
  })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

function put(id: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(`/api/models/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  })
}

describe('nycklar', () => {
  it('ger åtkomst som ägaren, och sparar bara en hash', async () => {
    const { token } = await tokens.create(user, 'Laptop')
    const me = await app.request('/api/me', { headers: bearer(token) })
    expect(await me.json()).toMatchObject({ sub: 'anna', via: 'token', models: 0, limits: LIMITS })
    const raw = await readFile(path.join(dir, 'tokens.json'), 'utf8')
    expect(raw).not.toContain(token.split('_')[2])
    expect((await stat(path.join(dir, 'tokens.json'))).mode & 0o777).toBe(0o600)
  })

  it('en fel, påhittad eller utgången nyckel ger 401', async () => {
    const { token } = await tokens.create(user, 'Laptop')
    const wrong = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')
    expect((await app.request('/api/models', { headers: bearer(wrong) })).status).toBe(401)
    expect((await app.request('/api/models', { headers: bearer('bygg_x') })).status).toBe(401)
    now += 91 * 86_400_000
    expect((await app.request('/api/models', { headers: bearer(token) })).status).toBe(401)
  })

  it('logout tar bort nyckeln', async () => {
    const { token } = await tokens.create(user, 'Laptop')
    expect((await app.request('/api/tokens/current', { method: 'DELETE', headers: bearer(token) })).status).toBe(204)
    expect((await app.request('/api/models', { headers: bearer(token) })).status).toBe(401)
  })

  it('en ny nyckel tar bort den äldsta när användaren har så många hen får ha', async () => {
    const first = await tokens.create(user, 'första')
    for (let i = 1; i < MAX_TOKENS_PER_USER; i++) await tokens.create(user, `nr ${i}`)
    expect(await tokens.list('anna')).toHaveLength(MAX_TOKENS_PER_USER)
    await tokens.create(user, 'ny')
    const list = await tokens.list('anna')
    expect(list).toHaveLength(MAX_TOKENS_PER_USER)
    expect(list.map((t) => t.id)).not.toContain(first.info.id)
    expect(await tokens.verify(first.token)).toBeNull()
  })

  it('nycklar skapas bara på sidan i webbläsaren, inte med en nyckel', async () => {
    const { token } = await tokens.create(user, 'Laptop')
    const r = await app.request('/auth/cli', { method: 'POST', headers: bearer(token) })
    // I dev är man alltid inloggad; nyckeln skapas då åt dev-användaren, aldrig åt nyckelns ägare.
    expect(await r.text()).toContain('bygg_')
    expect(await tokens.list('anna')).toHaveLength(1)
  })

  it('sidan visar nyckeln en gång, med namnet undantaget från HTML', async () => {
    const r = await app.request('/auth/cli', {
      method: 'POST',
      body: new URLSearchParams({ label: '<script>x</script>' }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    const html = await r.text()
    expect(html).toMatch(/value="bygg_[0-9a-f]{16}_/)
    expect(html).not.toContain('<script>x')
    expect(r.headers.get('cache-control')).toBe('no-store')
    const again = await (await app.request('/auth/cli')).text()
    expect(again).not.toMatch(/value="bygg_/)
  })

  it('formulären skickar sin origin, så att origin-kontrollen släpper igenom dem', async () => {
    // Med no-referrer skickar webbläsaren Origin: null för POST, och då blir svaret "Fel origin".
    const html = await (await app.request('/auth/cli')).text()
    expect(html).toContain('<meta name="referrer" content="same-origin">')
  })
})

describe('takt för nycklar', () => {
  it('stoppar efter perMinute anrop och släpper nästa minut', async () => {
    const { token } = await tokens.create(user, 'Laptop')
    for (let i = 0; i < RATE.perMinute; i++)
      expect((await app.request('/api/models', { headers: bearer(token) })).status).toBe(200)
    const r = await app.request('/api/models', { headers: bearer(token) })
    expect(r.status).toBe(429)
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0)
    now += 60_000
    expect((await app.request('/api/models', { headers: bearer(token) })).status).toBe(200)
  })

  it('gäller inte webbläsaren', async () => {
    for (let i = 0; i < RATE.perMinute + 5; i++) expect((await app.request('/api/models')).status).toBe(200)
  })
})

describe('gränser på servern', () => {
  const parts = (n: number) => ({
    ...emptyDoc,
    defs: [
      {
        id: 'd',
        name: 'Del',
        material: 'furu',
        grainAxis: 'u',
        thicknessAxis: 'n',
        profile: { x0: 0, y0: 0, x1: 100, y1: 100 },
        z0: 0,
        z1: 20,
      },
    ],
    instances: Array.from({ length: n }, (_, i) => ({ id: `i${i}`, defId: 'd', frame: GROUND_FRAME })),
  })

  it('nekar en modell med fler delar än gränsen', async () => {
    const ok = await put(ID, { name: 'Stor', baseRevision: null, file: { ...file, doc: parts(LIMITS.instances) } })
    expect(ok.status).toBe(200)
    const r = await put(ID, { name: 'Stor', baseRevision: 1, file: { ...file, doc: parts(LIMITS.instances + 1) } })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/högst 2000 delar/)
  })

  it('nekar en ny modell när användaren redan har så många hen får ha', async () => {
    const storage = await new UserStorages(dir).for('dev')
    for (let i = 0; i < LIMITS.models; i++) {
      const id = `11111111-2222-4333-8444-${String(i).padStart(12, '0')}`
      await storage.put(id, `M${i}`, null, file)
    }
    const r = await put(ID, { name: 'En till', baseRevision: null, file })
    expect(r.status).toBe(403)
    expect((await r.json()).error).toMatch(/högst 500 modeller/)
    // En befintlig går fortfarande att spara.
    const existing = '11111111-2222-4333-8444-000000000000'
    expect((await put(existing, { name: 'M0', baseRevision: 1, file })).status).toBe(200)
  })
})
