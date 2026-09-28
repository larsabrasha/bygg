import 'fake-indexeddb/auto'
import { mkdtempSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../server/app'
import { devAuth } from '../../server/auth'
import { UserStorages } from '../../server/storage'

/**
 * Sessionen (autospar och synk) i två "flikar": egna exemplar av modulerna, men samma IndexedDB,
 * samma Web Locks och samma BroadcastChannel, som två flikar i samma webbläsare. Servern är den
 * riktiga appen, med lagring i en temporär katalog.
 */

const dataDir = mkdtempSync(path.join(tmpdir(), 'bygg-session-'))
const app = createApp({ storages: new UserStorages(dataDir), auth: devAuth() })

beforeAll(() => {
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => app.request(url, init))
  // Det start() lyssnar på i webbläsaren.
  const noop = () => {}
  vi.stubGlobal('window', { addEventListener: noop, removeEventListener: noop })
  vi.stubGlobal('document', { addEventListener: noop, removeEventListener: noop, visibilityState: 'visible' })
  vi.stubGlobal('location', { pathname: '/', search: '', hash: '' })
  vi.stubGlobal('history', { state: null, pushState: noop, replaceState: noop, back: noop })
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await rm(dataDir, { recursive: true, force: true })
})

async function tab() {
  vi.resetModules()
  const localStore = await import('./localStore')
  const session = await import('./session')
  const { useDocumentStore } = await import('../store/documentStore')
  const { useLibraryStore } = await import('../store/libraryStore')
  await localStore.selectUser('dev')
  const docs = useDocumentStore
  const lib = useLibraryStore
  return {
    session,
    lib,
    params: () => docs.getState().doc.params.map((p) => p.name),
    addParam(name: string) {
      const id = docs.getState().addParam()!
      docs.getState().updateParam(id, { name, expr: '1' })
    },
    notices: () => lib.getState().notices.map((n) => n.text),
  }
}

const onServer = async (id: string) => {
  const raw = JSON.parse(await readFile(path.join(dataDir, 'users/dev/models', `${id}.json`), 'utf8'))
  return { name: raw.name as string, params: (raw.file.doc.params as { name: string }[]).map((p) => p.name) }
}

const serverNames = async () => ((await (await app.request('/api/models')).json()) as { name: string }[]).map((m) => m.name)

/** En modell som finns på servern och är öppen i två flikar. */
async function openInTwoTabs() {
  const a = await tab()
  await a.session.createModel()
  a.addParam('base')
  await a.session.saveNow()
  await a.session.syncNow()
  const id = a.lib.getState().currentId!
  const b = await tab()
  await b.session.openModel(id)
  expect(b.params()).toEqual(['base'])
  return { a, b, id }
}

describe('två flikar med samma modell', () => {
  it('ändrar båda sparas den andra som en kopia; ingen ändring försvinner', async () => {
    const { a, b, id } = await openInTwoTabs()

    a.addParam('fromA')
    await a.session.saveNow()
    b.addParam('fromB')
    await b.session.saveNow()

    // B skrev inte över A:s version, utan fortsätter i en kopia.
    const copyId = b.lib.getState().currentId!
    expect(copyId).not.toBe(id)
    expect(b.lib.getState().currentName).toMatch(/\(konflikt /)
    expect(b.notices().some((t) => t.includes('i en annan flik'))).toBe(true)

    await a.session.syncNow()
    await b.session.syncNow()
    expect(await onServer(id)).toMatchObject({ params: ['base', 'fromA'] })
    expect(await onServer(copyId)).toMatchObject({ params: ['base', 'fromB'] })
    // A:s fönster och det sparade stämmer: A:s ändring finns kvar om fliken stängs.
    expect(a.params()).toEqual(['base', 'fromA'])
  })

  it('en flik utan egna ändringar visar den andra flikens version, och bygger vidare på den', async () => {
    const { a, b, id } = await openInTwoTabs()
    const stopA = a.session.start()
    const stopB = b.session.start()
    try {
      a.addParam('fromA')
      await a.session.saveNow()
      await vi.waitFor(() => expect(b.params()).toEqual(['base', 'fromA']))
      expect(b.notices()).toContain(`"${b.lib.getState().currentName}" ändrades i en annan flik.`)
      // A laddar upp, och sedan ändrar B: B ska utgå från A:s revision, inte krocka med den.
      await a.session.syncNow()
      b.addParam('fromB')
      await b.session.saveNow()
      await b.session.syncNow()
      expect(b.lib.getState().currentId).toBe(id)
      expect(await onServer(id)).toMatchObject({ params: ['base', 'fromA', 'fromB'] })
      expect((await serverNames()).filter((n) => n.includes('konflikt'))).toHaveLength(1) // bara från testet ovan
    } finally {
      stopA()
      stopB()
    }
  })
})

describe('sparningen på enheten misslyckas', () => {
  it('säger det, och sparar när det går igen', async () => {
    const a = await tab()
    await a.session.createModel()
    a.addParam('one')
    await a.session.saveNow()
    await a.session.syncNow()
    const id = a.lib.getState().currentId!

    a.addParam('two')
    const proto = IDBObjectStore.prototype
    const put = proto.put
    proto.put = () => {
      throw new DOMException('Fullt', 'QuotaExceededError')
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await a.session.saveNow()
      await a.session.syncNow()
    } finally {
      proto.put = put
      vi.mocked(console.error).mockRestore()
    }
    expect(a.lib.getState()).toMatchObject({ status: 'error', error: 'Lagringen på enheten är full' })
    expect(a.notices().some((t) => t.startsWith('Lagringen på enheten är full.'))).toBe(true)
    expect((await onServer(id)).params).toEqual(['one'])

    // Nästa synk försöker spara igen, också utan en ny ändring.
    await a.session.syncNow()
    expect(a.lib.getState()).toMatchObject({ status: 'synced', error: null })
    expect((await onServer(id)).params).toEqual(['one', 'two'])
  })
})
