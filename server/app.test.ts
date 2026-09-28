import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FORMAT_VERSION, serialize } from '../src/persist/format'
import { createApp } from './app'
import { devAuth } from './auth'
import { UserStorages } from './storage'

const ID = '11111111-2222-4333-8444-555555555555'
const emptyDoc = { sketches: [], defs: [], instances: [], params: [] }
const file = serialize(emptyDoc, new Date('2026-09-25T10:00:00Z'))

let dir: string
/** Dev-användarens modeller. */
let userDir: string
let app: ReturnType<typeof createApp>

async function put(body: unknown, id = ID, headers: Record<string, string> = {}) {
  return app.request(`/api/models/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  })
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'bygg-test-'))
  userDir = path.join(dir, 'users', 'dev')
  app = createApp({ storages: new UserStorages(dir, () => new Date('2026-09-25T12:00:00Z')), auth: devAuth() })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('API', () => {
  it('health svarar och visar formatversion', async () => {
    const r = await app.request('/api/health')
    expect(await r.json()).toEqual({ ok: true, formatVersion: FORMAT_VERSION })
  })

  it('sparar en ny modell och räknar upp revisionen', async () => {
    const r1 = await put({ name: 'Bord', baseRevision: null, file })
    expect(r1.status).toBe(200)
    expect(await r1.json()).toEqual({ revision: 1, updatedAt: '2026-09-25T12:00:00.000Z' })
    const r2 = await put({ name: 'Bord', baseRevision: 1, file })
    expect((await r2.json()).revision).toBe(2)
  })

  it('lagrar en läsbar JSON-fil per modell', async () => {
    await put({ name: 'Bord', baseRevision: null, file })
    const raw = await readFile(path.join(userDir, 'models', `${ID}.json`), 'utf8')
    expect(raw).toContain('\n  "name": "Bord"')
    expect(JSON.parse(raw)).toMatchObject({ id: ID, name: 'Bord', revision: 1, file: { version: FORMAT_VERSION } })
  })

  it('svarar 409 med serverns version när baseRevision inte stämmer', async () => {
    await put({ name: 'Bord', baseRevision: null, file })
    await put({ name: 'Bord v2', baseRevision: 1, file })
    const r = await put({ name: 'Min ändring', baseRevision: 1, file })
    expect(r.status).toBe(409)
    expect((await r.json()).current).toMatchObject({ name: 'Bord v2', revision: 2 })
  })

  it('en ny modell får inte skriva över en befintlig', async () => {
    await put({ name: 'Bord', baseRevision: null, file })
    expect((await put({ name: 'Annan', baseRevision: null, file })).status).toBe(409)
  })

  it('listar och hämtar modeller', async () => {
    await put({ name: 'Bord', baseRevision: null, file })
    expect(await (await app.request('/api/models')).json()).toEqual([
      { id: ID, name: 'Bord', revision: 1, updatedAt: '2026-09-25T12:00:00.000Z' },
    ])
    expect(await (await app.request(`/api/models/${ID}`)).json()).toMatchObject({ name: 'Bord', file })
  })

  it('en fil som inte går att läsa står kvar i listan, som trasig', async () => {
    await put({ name: 'Bord', baseRevision: null, file })
    // Som efter en avbruten skrivning, eller en handredigerad säkerhetskopia.
    await writeFile(path.join(userDir, 'models', `${ID}.json`), '{"id": "')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await (await app.request('/api/models')).json()).toEqual([
      { id: ID, name: '(går inte att läsa)', revision: 0, updatedAt: expect.any(String), broken: true },
    ])
    // Och ett fel svarar med JSON, så att appen inte tror att servern saknas.
    const r = await app.request(`/api/models/${ID}`)
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'Serverfel' })
    vi.restoreAllMocks()
  })

  it('konverterar äldre format till nuvarande när det sparas', async () => {
    const v1 = { version: 1, savedAt: 'x', doc: emptyDoc }
    await put({ name: 'Gammal', baseRevision: null, file: v1 })
    const m = await (await app.request(`/api/models/${ID}`)).json()
    expect(m.file.version).toBe(FORMAT_VERSION)
  })

  it('flyttar borttagna modeller till papperskorgen', async () => {
    await put({ name: 'Bord', baseRevision: null, file })
    expect((await app.request(`/api/models/${ID}?baseRevision=2`, { method: 'DELETE' })).status).toBe(409)
    expect((await app.request(`/api/models/${ID}?baseRevision=1`, { method: 'DELETE' })).status).toBe(204)
    expect(await readdir(path.join(userDir, 'models'))).toEqual([])
    expect(await readdir(path.join(userDir, 'trash'))).toHaveLength(1)
    expect((await app.request(`/api/models/${ID}`)).status).toBe(404)
  })

  it.each([
    ['saknat namn', { baseRevision: null, file }],
    ['ogiltig baseRevision', { name: 'x', baseRevision: 0, file }],
    ['trasig modell', { name: 'x', baseRevision: null, file: { version: 2, doc: { defs: 'nej' } } }],
  ])('avvisar %s med 400', async (_, body) => {
    expect((await put(body)).status).toBe(400)
  })

  it('avvisar id som inte är UUID, så att id aldrig blir en sökväg', async () => {
    expect((await put({ name: 'x', baseRevision: null, file }, '..%2F..%2Fetc')).status).toBe(400)
    expect((await app.request('/api/models/not-a-uuid')).status).toBe(400)
  })

  it('samtidiga sparningar från samma revision: bara en lyckas', async () => {
    await put({ name: 'Bord', baseRevision: null, file })
    const results = await Promise.all([1, 2, 3].map(() => put({ name: 'x', baseRevision: 1, file })))
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409])
  })
})

describe('bilden av en modell', () => {
  // En PNG börjar med de här åtta byten; resten spelar ingen roll för servern.
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]) as Uint8Array<ArrayBuffer>
  const putThumb = (body: Uint8Array<ArrayBuffer>, id = ID) =>
    app.request(`/api/models/${id}/thumb`, { method: 'PUT', body, headers: { 'content-type': 'image/png' } })

  it('sparas och hämtas som PNG', async () => {
    await put({ name: 'Bord', baseRevision: null, file })
    expect((await putThumb(png)).status).toBe(204)
    const r = await app.request(`/api/models/${ID}/thumb`)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(png)
  })

  it('bara för en modell som finns, och bara PNG', async () => {
    expect((await putThumb(png)).status).toBe(404)
    expect((await app.request(`/api/models/${ID}/thumb`)).status).toBe(404)
    await put({ name: 'Bord', baseRevision: null, file })
    expect((await putThumb(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).status).toBe(400)
    expect((await putThumb(png, '../../etc')).status).toBe(404)
    expect((await app.request('/api/models/inte-ett-id/thumb')).status).toBe(400)
  })

  it('följer med modellen till papperskorgen', async () => {
    await put({ name: 'Bord', baseRevision: null, file })
    await putThumb(png)
    await app.request(`/api/models/${ID}?baseRevision=1`, { method: 'DELETE' })
    expect((await app.request(`/api/models/${ID}/thumb`)).status).toBe(404)
    expect((await readdir(path.join(userDir, 'trash'))).some((f) => f.endsWith('.png'))).toBe(true)
  })
})

describe('material och färger', () => {
  const putCatalog = (body: unknown) =>
    app.request('/api/catalog', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  const catalog = {
    materials: [
      {
        id: 'm1',
        name: 'Valchromat',
        kind: 'sheet',
        grain: false,
        color: '#334455',
        updatedAt: '2026-09-27T10:00:00Z',
      },
    ],
    colors: [
      { id: 'c1', name: 'Monterblå', color: '#2f4a5c', code: 'NCS S 7020-B', updatedAt: '2026-09-27T10:00:00Z' },
    ],
    hidden: ['ek'],
    removed: {},
  }

  it('saknas tills den sparats, och räknar sedan upp revisionen', async () => {
    expect((await app.request('/api/catalog')).status).toBe(404)
    expect(await (await putCatalog({ baseRevision: null, catalog })).json()).toMatchObject({ revision: 1 })
    const got = await (await app.request('/api/catalog')).json()
    expect(got).toMatchObject({ revision: 1, catalog: { hidden: ['ek'], colors: [{ code: 'NCS S 7020-B' }] } })
    expect(JSON.parse(await readFile(path.join(userDir, 'catalog.json'), 'utf8')).revision).toBe(1)
  })

  it('svarar 409 med serverns lista när baseRevision inte stämmer', async () => {
    await putCatalog({ baseRevision: null, catalog })
    const r = await putCatalog({ baseRevision: null, catalog })
    expect(r.status).toBe(409)
    expect((await r.json()).current.revision).toBe(1)
  })

  it('släpper poster som inte ser rimliga ut, och ett eget material med ett inbyggts id', async () => {
    const bad = {
      ...catalog,
      materials: [...catalog.materials, { ...catalog.materials[0], id: 'mdf' }, { id: 'x', name: 'Trasig' }],
      colors: [...catalog.colors, { id: 'c2', name: 'Röd', color: 'röd', updatedAt: 'x' }],
    }
    await putCatalog({ baseRevision: null, catalog: bad })
    const got = await (await app.request('/api/catalog')).json()
    expect(got.catalog.materials.map((m: { id: string }) => m.id)).toEqual(['m1'])
    expect(got.catalog.colors.map((c: { id: string }) => c.id)).toEqual(['c1'])
  })
})

describe('papperskorgen', () => {
  const ID2 = '66666666-7777-4888-9999-000000000000'
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]) as Uint8Array<ArrayBuffer>
  let now: Date
  let storages: UserStorages

  beforeEach(() => {
    now = new Date('2026-09-25T12:00:00Z')
    storages = new UserStorages(dir, () => now)
    app = createApp({ storages, auth: devAuth() })
  })

  const remove = (id = ID, revision = 1) =>
    app.request(`/api/models/${id}?baseRevision=${revision}`, { method: 'DELETE' })
  const trash = async () => (await app.request('/api/trash')).json()
  const restore = (id = ID) => app.request(`/api/trash/${id}/restore`, { method: 'POST' })

  it('listar det som tagits bort, med namn och när', async () => {
    await put({ name: 'Bord', baseRevision: null, file })
    await remove()
    expect(await trash()).toEqual([{ id: ID, name: 'Bord', deletedAt: '2026-09-25T12:00:00.000Z' }])
  })

  it('tar tillbaka modellen med samma revision och bild', async () => {
    await put({ name: 'Bord', baseRevision: null, file })
    await put({ name: 'Bord', baseRevision: 1, file })
    await app.request(`/api/models/${ID}/thumb`, { method: 'PUT', body: png, headers: { 'content-type': 'image/png' } })
    await remove(ID, 2)
    expect((await app.request(`/api/trash/${ID}/thumb`)).status).toBe(200)
    const r = await restore()
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ revision: 2 })
    expect((await app.request(`/api/models/${ID}`)).status).toBe(200)
    expect((await app.request(`/api/models/${ID}/thumb`)).status).toBe(200)
    expect(await trash()).toEqual([])
    expect(await readdir(path.join(userDir, 'trash'))).toEqual([])
    // Tillbaka på riktigt: den går att spara vidare från sin revision.
    expect((await put({ name: 'Bord', baseRevision: 2, file })).status).toBe(200)
  })

  it('visar en modell en gång, den senaste, och tar tillbaka den', async () => {
    await put({ name: 'Bord', baseRevision: null, file })
    await remove()
    now = new Date('2026-09-26T12:00:00Z')
    // Samma id igen (appen laddar upp en modell som togs bort medan den ändrades), och bort igen.
    await put({ name: 'Bord 2', baseRevision: null, file })
    await remove()
    expect(await trash()).toEqual([{ id: ID, name: 'Bord 2', deletedAt: '2026-09-26T12:00:00.000Z' }])
    await restore()
    expect((await (await app.request(`/api/models/${ID}`)).json()).name).toBe('Bord 2')
    expect(await readdir(path.join(userDir, 'trash'))).toEqual([])
  })

  it('tar inte tillbaka något som saknas, eller över en modell med samma id', async () => {
    expect((await restore()).status).toBe(404)
    await put({ name: 'Bord', baseRevision: null, file })
    await remove()
    await put({ name: 'Ny', baseRevision: null, file })
    expect((await restore()).status).toBe(409)
    expect((await (await app.request(`/api/models/${ID}`)).json()).name).toBe('Ny')
  })

  it('raderar för gott', async () => {
    await put({ name: 'Bord', baseRevision: null, file })
    await remove()
    expect((await app.request(`/api/trash/${ID}`, { method: 'DELETE' })).status).toBe(204)
    expect(await trash()).toEqual([])
    expect(await readdir(path.join(userDir, 'trash'))).toEqual([])
    expect((await app.request(`/api/trash/${ID}`, { method: 'DELETE' })).status).toBe(404)
    expect((await app.request('/api/trash/inte-ett-id', { method: 'DELETE' })).status).toBe(400)
  })

  it('raderar det som legat där i 30 dagar', async () => {
    await put({ name: 'Gammal', baseRevision: null, file })
    await put({ name: 'Ny', baseRevision: null, file }, ID2)
    await remove(ID)
    now = new Date('2026-10-10T12:00:00Z')
    await remove(ID2)
    now = new Date('2026-10-25T11:59:59Z')
    expect((await trash()).map((t: { name: string }) => t.name)).toEqual(['Ny', 'Gammal'])
    now = new Date('2026-10-25T12:00:00Z')
    expect((await trash()).map((t: { name: string }) => t.name)).toEqual(['Ny'])
    // Också utan att någon öppnar papperskorgen (servern rensar två gånger om dygnet).
    now = new Date('2026-11-09T12:00:00Z')
    expect(await storages.purgeOldTrash()).toBe(1)
    expect(await readdir(path.join(userDir, 'trash'))).toEqual([])
  })

  it('räknas inte mot antalet modeller, men en som tas tillbaka gör det', async () => {
    await put({ name: 'Bord', baseRevision: null, file })
    await remove()
    const storage = await storages.for('dev')
    expect(await storage.count()).toBe(0)
    expect((await storage.restore(ID, 0)).ok).toBe(false)
    expect((await restore()).status).toBe(200)
    expect(await storage.count()).toBe(1)
  })
})
