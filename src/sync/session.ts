import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval'
import { newId } from '../model/id'
import type { ModelDocument } from '../model/types'
import { migrate, serialize } from '../persist/format'
import { emptyDocument, useDocumentStore } from '../store/documentStore'
import { useLibraryStore, type SyncStatus } from '../store/libraryStore'
import { useToolStore } from '../store/toolStore'
import { ApiError, httpApi } from './api'
import { syncOnce, type SyncEvent } from './engine'
import { idbRepo, importLegacy, LEGACY_KEY, type LocalModel } from './localRepo'

/**
 * Kopplar ihop den öppna modellen (documentStore) med det lokala förrådet och servern:
 * sparar lokalt kort efter varje ändring, synkar i bakgrunden och tar hand om
 * det synkmotorn rapporterar (krockar, ändringar från andra enheter).
 */

const SAVE_DELAY_MS = 400
const SYNC_DELAY_MS = 2000
const SYNC_INTERVAL_MS = 60_000
const repo = idbRepo()
const api = httpApi()

const docs = () => useDocumentStore.getState()
const lib = () => useLibraryStore.getState()

/** Senast sparade dokument; en ändring i storen som inte är detta behöver sparas. */
let lastPersistedDoc: ModelDocument | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let syncTimer: ReturnType<typeof setTimeout> | null = null
let syncing: Promise<void> | null = null
let rerun = false
let askedPersist = false

async function refreshList() {
  const models = (await repo.list())
    .filter((m) => !m.deleted)
    .map(({ id, name, updatedAt, dirty }) => ({ id, name, updatedAt, dirty }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  lib().set({ models })
}

/** Laddar en lokal modell i storen utan att det räknas som en ändring. */
function showModel(m: LocalModel): boolean {
  const r = migrate(m.file)
  if (!r.ok) {
    lib().notify(`"${m.name}" går inte att öppna: ${r.reason}.`)
    return false
  }
  useToolStore.getState().setTool('select')
  docs().load(r.doc)
  lastPersistedDoc = docs().doc
  lib().set({ currentId: m.id, currentName: m.name, currentBase: m.baseRevision })
  void repo.setCurrentId(m.id)
  return true
}

/** Skriver den öppna modellen till det lokala förrådet, om den ändrats. */
async function persistNow(force = false) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  const { currentId, currentName, currentBase } = lib()
  const doc = docs().doc
  if (!currentId || (!force && doc === lastPersistedDoc)) return
  lastPersistedDoc = doc
  // Be om beständig lagring så att webbläsaren inte rensar modellerna vid platsbrist.
  // Först vid första sparningen: Firefox frågar användaren, och det ska inte ske vid sidladdning.
  if (!askedPersist) {
    askedPersist = true
    navigator.storage?.persist?.().catch(() => {})
  }
  await repo.put({
    id: currentId,
    name: currentName,
    file: serialize(doc),
    updatedAt: new Date().toISOString(),
    baseRevision: currentBase,
    dirty: true,
  })
  await refreshList()
  scheduleSync(SYNC_DELAY_MS)
}

/** Sparar den öppna modellen lokalt direkt (t.ex. innan sidan laddas om). */
export async function saveNow() {
  if (syncing) await syncing
  await persistNow()
}

/** Väntar in pågående synk, så att sparningen hamnar på rätt modell efter en ev. krock. */
async function flushSave() {
  if (syncing) await syncing
  await persistNow()
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void flushSave(), SAVE_DELAY_MS)
}

function scheduleSync(delay: number) {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => void syncNow(), delay)
}

const STATUS_FOR: Record<ApiError['kind'], SyncStatus> = {
  offline: 'offline',
  'no-server': 'local-only',
  server: 'error',
}

async function openFallback() {
  const next = (await repo.list()).filter((m) => !m.deleted).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  if (next) showModel(next)
  else await createModel()
}

async function handle(events: SyncEvent[], docAtStart: ModelDocument) {
  const { currentId } = lib()
  // Inga osparade ändringar sedan synken startade: då får vi byta innehåll i den öppna modellen.
  const untouched = () => docs().doc === docAtStart && docAtStart === lastPersistedDoc

  for (const e of events) {
    const isCurrent = e.id === currentId
    switch (e.kind) {
      case 'pushed':
        if (isCurrent) lib().set({ currentBase: e.revision })
        break
      case 'conflict':
        if (isCurrent) {
          // Vi fortsätter i vår egen version, som nu är kopian.
          lib().set({ currentId: e.copyId, currentName: e.copyName, currentBase: null })
          void repo.setCurrentId(e.copyId)
        }
        lib().notify(
          `Modellen hade ändrats på en annan enhet. Den versionen ligger kvar under sitt namn; din sparades som "${e.copyName}".`,
        )
        break
      case 'remote-update':
        if (isCurrent && untouched()) {
          const m = await repo.get(e.id)
          if (m && showModel(m)) lib().notify(`"${m.name}" uppdaterades från en annan enhet.`)
        }
        break
      case 'remote-delete':
        if (isCurrent) {
          if (untouched()) {
            lib().notify('Modellen togs bort på en annan enhet.')
            await openFallback()
          } else {
            // Osparade ändringar: behåll dem som en ny modell.
            lib().set({ currentBase: null })
            await persistNow(true)
          }
        }
        break
      case 'delete-conflict':
        lib().notify('En modell du tog bort hade ändrats på en annan enhet, så den finns kvar.')
        break
      case 'incompatible':
        lib().notify(`"${e.name}" är sparad med en nyare version av appen. Ladda om sidan för att uppdatera.`)
        break
    }
  }
}

/** Synkar nu. Anrop under pågående synk ger en runda till efteråt. */
export function syncNow(): Promise<void> {
  if (syncing) {
    rerun = true
    return syncing
  }
  syncing = (async () => {
    try {
      do {
        rerun = false
        await persistNow()
        lib().set({ status: 'syncing', error: null })
        const docAtStart = docs().doc
        const { events, again } = await syncOnce({ api, repo, newId })
        await handle(events, docAtStart)
        if (again) rerun = true
      } while (rerun)
      lib().set({ status: 'synced', error: null })
    } catch (e) {
      if (e instanceof ApiError) lib().set({ status: STATUS_FOR[e.kind], error: e.message })
      else {
        console.error('[bygg] Synkfel', e)
        lib().set({ status: 'error', error: String(e) })
      }
    } finally {
      syncing = null
      await refreshList()
    }
  })()
  return syncing
}

/** Öppnar senast använda modell vid start (och flyttar över den gamla enkelmodellen första gången). */
export async function openInitial() {
  await importLegacy(
    repo,
    () => idbGet(LEGACY_KEY),
    async () => {
      const raw = await idbGet(LEGACY_KEY)
      await idbSet(`${LEGACY_KEY}:imported`, raw)
      await idbDel(LEGACY_KEY)
    },
    newId,
  ).catch((e) => console.warn('[bygg] Kunde inte flytta gammal modell', e))

  const currentId = await repo.getCurrentId().catch(() => null)
  const current = currentId ? await repo.get(currentId) : undefined
  if (current && !current.deleted && showModel(current)) return
  // Ny enhet: hämta från servern först, så att vi inte laddar upp en tom modell i onödan.
  if ((await repo.list()).length === 0) await syncNow()
  await openFallback()
}

export async function openModel(id: string) {
  if (id === lib().currentId) return
  await flushSave()
  const m = await repo.get(id)
  if (m) showModel(m)
}

export async function createModel() {
  await flushSave()
  const names = new Set(lib().models.map((m) => m.name))
  let n = 1
  while (names.has(n === 1 ? 'Ny modell' : `Ny modell ${n}`)) n++
  const m: LocalModel = {
    id: newId(),
    name: n === 1 ? 'Ny modell' : `Ny modell ${n}`,
    file: serialize(emptyDocument()),
    updatedAt: new Date().toISOString(),
    baseRevision: null,
    dirty: true,
  }
  await repo.put(m)
  showModel(m)
  await refreshList()
  scheduleSync(SYNC_DELAY_MS)
}

export async function renameModel(id: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) return
  if (id === lib().currentId) {
    lib().set({ currentName: trimmed })
    await persistNow(true)
    return
  }
  const m = await repo.get(id)
  if (!m) return
  await repo.put({ ...m, name: trimmed, dirty: true, updatedAt: new Date().toISOString() })
  await refreshList()
  scheduleSync(SYNC_DELAY_MS)
}

/** Tar bort lokalt direkt; på servern vid nästa synk (hamnar i serverns papperskorg). */
export async function deleteModel(id: string) {
  await flushSave()
  const m = await repo.get(id)
  if (!m) return
  if (m.baseRevision === null) await repo.remove(id)
  else await repo.put({ ...m, deleted: true })
  if (id === lib().currentId) await openFallback()
  await refreshList()
  scheduleSync(0)
}

/** Startar autospar och bakgrundssynk. Returnerar en funktion som stänger av dem. */
export function start(): () => void {
  // Efter HMR finns dokumentet redan; räkna det som sparat så att det inte sparas i onödan.
  lastPersistedDoc ??= docs().doc
  const unsubscribe = useDocumentStore.subscribe((s, prev) => {
    if (s.doc !== prev.doc && s.doc !== lastPersistedDoc) scheduleSave()
  })
  const onOnline = () => void syncNow()
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void syncNow()
    // Mobilen kan stänga en flik i bakgrunden utan förvarning.
    else void persistNow()
  }
  const onPageHide = () => void persistNow()
  const interval = setInterval(() => void syncNow(), SYNC_INTERVAL_MS)
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onPageHide)
  void syncNow()

  return () => {
    unsubscribe()
    clearInterval(interval)
    if (syncTimer) clearTimeout(syncTimer)
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onPageHide)
    void persistNow()
  }
}
