import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FORMAT_VERSION, serialize } from '../src/persist/format'
import { createApp } from './app'
import { FileStorage } from './storage'

const ID = '11111111-2222-4333-8444-555555555555'
const emptyDoc = { sketches: [], defs: [], instances: [], params: [] }
const file = serialize(emptyDoc, new Date('2026-09-25T10:00:00Z'))

let dir: string
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
  const storage = new FileStorage(dir, () => new Date('2026-09-25T12:00:00Z'))
  await storage.init()
  app = createApp({ storage })
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
    const raw = await readFile(path.join(dir, 'models', `${ID}.json`), 'utf8')
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
    expect(await readdir(path.join(dir, 'models'))).toEqual([])
    expect(await readdir(path.join(dir, 'trash'))).toHaveLength(1)
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
    expect((await readdir(path.join(dir, 'trash'))).some((f) => f.endsWith('.png'))).toBe(true)
  })
})
