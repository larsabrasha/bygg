import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app'
import { FileStorage } from '../../server/storage'
import { newId } from '../model/id'
import { serialize, type SavedFile } from '../persist/format'
import { ApiError, httpApi, type SyncApi } from './api'
import { syncOnce } from './engine'
import { memoryRepo, type LocalModel } from './localRepo'

/**
 * Integrationstester: två "enheter" (egna lokala förråd) mot den riktiga
 * server-appen, med lagring i en temporär katalog.
 */

let dir: string
let api: SyncApi

const file = (params: number): SavedFile =>
  serialize({
    sketches: [],
    defs: [],
    instances: [],
    params: [{ id: 'p', name: 't', expr: `${params}`, value: params }],
  })

function localModel(overrides: Partial<LocalModel> = {}): LocalModel {
  return {
    id: newId(),
    name: 'Bord',
    file: file(22),
    updatedAt: new Date().toISOString(),
    baseRevision: null,
    dirty: true,
    ...overrides,
  }
}

function device() {
  const repo = memoryRepo()
  const sync = () => syncOnce({ api, repo, newId, now: () => new Date('2026-09-25T14:30:00') })
  const edit = async (id: string, value: number) => {
    const m = (await repo.get(id))!
    await repo.put({ ...m, file: file(value), dirty: true, updatedAt: new Date(Date.now() + 1000).toISOString() })
  }
  const value = async (id: string) => (await repo.get(id))?.file.doc.params[0]?.value
  return { repo, sync, edit, value }
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'bygg-sync-'))
  const storage = new FileStorage(dir)
  await storage.init()
  const app = createApp({ storage })
  api = httpApi('http://test', async (url, init) => app.request(url, init))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('synk mellan två enheter', () => {
  it('en ny modell laddas upp och dyker upp på den andra enheten', async () => {
    const a = device()
    const b = device()
    const m = localModel()
    await a.repo.put(m)
    const ra = await a.sync()
    expect(ra.events).toEqual([{ kind: 'pushed', id: m.id, revision: 1 }])
    expect(await a.repo.get(m.id)).toMatchObject({ dirty: false, baseRevision: 1 })

    const rb = await b.sync()
    expect(rb.events).toEqual([{ kind: 'remote-update', id: m.id, isNew: true }])
    expect(await b.value(m.id)).toBe(22)
  })

  it('en ändring på A når B', async () => {
    const a = device()
    const b = device()
    const m = localModel()
    await a.repo.put(m)
    await a.sync()
    await b.sync()
    await a.edit(m.id, 18)
    await a.sync()
    const rb = await b.sync()
    expect(rb.events).toContainEqual({ kind: 'remote-update', id: m.id, isNew: false })
    expect(await b.value(m.id)).toBe(18)
  })

  it('krock: båda versionerna finns kvar, ingen skrivs över', async () => {
    const a = device()
    const b = device()
    const m = localModel()
    await a.repo.put(m)
    await a.sync()
    await b.sync()
    await a.edit(m.id, 18)
    await b.edit(m.id, 30)
    await a.sync()

    const rb = await b.sync()
    const conflict = rb.events.find((e) => e.kind === 'conflict')
    if (conflict?.kind !== 'conflict') throw new Error('Ingen krock rapporterades')
    expect(conflict).toMatchObject({ id: m.id, copyName: expect.stringMatching(/^Bord \(konflikt /) })
    expect(rb.again).toBe(true)
    // Originalet på B är nu A:s version; B:s version ligger i kopian.
    expect(await b.value(m.id)).toBe(18)
    expect(await b.value(conflict.copyId)).toBe(30)

    await b.sync() // laddar upp kopian
    await a.sync()
    expect((await api.list()).map((x) => x.name).sort()).toEqual(['Bord', conflict.copyName].sort())
    expect(await a.repo.list()).toHaveLength(2)
  })

  it('borttagning på A tar bort modellen på B', async () => {
    const a = device()
    const b = device()
    const m = localModel()
    await a.repo.put(m)
    await a.sync()
    await b.sync()
    await a.repo.put({ ...(await a.repo.get(m.id))!, deleted: true })
    await a.sync()
    expect(await api.list()).toEqual([])
    const rb = await b.sync()
    expect(rb.events).toEqual([{ kind: 'remote-delete', id: m.id }])
    expect(await b.repo.get(m.id)).toBeUndefined()
  })

  it('borttagen på A medan B ändrade: B:s version laddas upp igen', async () => {
    const a = device()
    const b = device()
    const m = localModel()
    await a.repo.put(m)
    await a.sync()
    await b.sync()
    await a.repo.put({ ...(await a.repo.get(m.id))!, deleted: true })
    await a.sync()
    await b.edit(m.id, 40)
    const r1 = await b.sync()
    expect(r1.again).toBe(true)
    await b.sync()
    const server = await api.get(m.id)
    expect(server?.file.doc.params[0]?.value).toBe(40)
  })

  it('A tar bort en modell som B just ändrat: borttagningen stoppas och B:s version finns kvar', async () => {
    const a = device()
    const b = device()
    const m = localModel()
    await a.repo.put(m)
    await a.sync()
    await b.sync()
    await b.edit(m.id, 50)
    await b.sync()
    await a.repo.put({ ...(await a.repo.get(m.id))!, deleted: true })
    const ra = await a.sync()
    expect(ra.events).toContainEqual({ kind: 'delete-conflict', id: m.id })
    expect(await a.value(m.id)).toBe(50)
  })

  it('en lokal ändring under uppladdningen förblir osynkad', async () => {
    const repo = memoryRepo()
    const m = localModel()
    await repo.put(m)
    // Api som ändrar den lokala modellen mitt i uppladdningen.
    const racing: SyncApi = {
      ...api,
      put: async (id, req) => {
        await repo.put({ ...(await repo.get(id))!, updatedAt: '2099-01-01T00:00:00.000Z' })
        return api.put(id, req)
      },
    }
    await syncOnce({ api: racing, repo, newId })
    expect(await repo.get(m.id)).toMatchObject({ baseRevision: 1, dirty: true })
  })

  it('hoppar över modeller i ett nyare format och säger till', async () => {
    const id = newId()
    const future = {
      id,
      name: 'Framtid',
      revision: 1,
      updatedAt: '2026-09-25T00:00:00Z',
      file: { version: 99, savedAt: '', doc: {} },
    }
    await writeFile(path.join(dir, 'models', `${id}.json`), JSON.stringify(future))
    const b = device()
    const r = await b.sync()
    expect(r.events).toEqual([{ kind: 'incompatible', id, name: 'Framtid' }])
    expect(await b.repo.get(id)).toBeUndefined()
  })
})

describe('utan server', () => {
  it('nätverksfel ger ApiError offline och ändrar inget lokalt', async () => {
    const offline = httpApi('', () => Promise.reject(new TypeError('fetch failed')))
    const repo = memoryRepo()
    const m = localModel()
    await repo.put(m)
    await expect(syncOnce({ api: offline, repo, newId })).rejects.toMatchObject({ kind: 'offline' })
    expect(await repo.get(m.id)).toEqual(m)
  })

  it('svar som inte är JSON (statisk hosting) ger no-server', async () => {
    const html = httpApi('', async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }))
    await expect(html.list()).rejects.toBeInstanceOf(ApiError)
    await expect(html.list()).rejects.toMatchObject({ kind: 'no-server' })
  })
})
