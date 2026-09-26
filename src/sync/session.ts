import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval'
import { newId } from '../model/id'
import type { ModelDocument } from '../model/types'
import { migrate, serialize } from '../persist/format'
import { emptyDocument, useDocumentStore } from '../store/documentStore'
import { useLibraryStore, type SyncStatus } from '../store/libraryStore'
import { useToolStore } from '../store/toolStore'
import { useViewStore } from '../store/viewStore'
import { ApiError, httpApi } from './api'
import { syncOnce, type SyncEvent } from './engine'
import { idbRepo, importLegacy, LEGACY_KEY, type LocalModel } from './localRepo'
import {
  captureThumbnail,
  deleteThumbnail,
  downloadThumbnail,
  getThumbnail,
  putThumbnail,
  uploadThumbnail,
} from './thumbnails'

/**
 * Kopplar ihop den öppna modellen (documentStore) med det lokala förrådet och servern:
 * sparar lokalt kort efter varje ändring, synkar i bakgrunden och tar hand om
 * det synkmotorn rapporterar (krockar, ändringar från andra enheter).
 */

const SAVE_DELAY_MS = 400
const SYNC_DELAY_MS = 2000
const SYNC_INTERVAL_MS = 60_000
/** Kortaste tid mellan två bilder av samma modell vid autospar. */
const THUMB_INTERVAL_MS = 3000
/** Så länge en borttagning går att ångra. */
const UNDO_DELETE_MS = 6000
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
let lastThumb = { id: '', at: 0 }
/** Bilder som tagits här men inte laddats upp än (modellen fanns kanske inte på servern). */
const unsentThumbs = new Set<string>()
/** Bilder att hämta från servern: saknas här, eller modellen ändrades på en annan enhet. */
const staleThumbs = new Set<string>()
/** Redan försökt hämta i den här sessionen och fått nej; försök inte igen varje synk. */
const noServerThumb = new Set<string>()
const deleteTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; notice: string }>()

async function refreshList() {
  const models = (await repo.list())
    .filter((m) => !m.deleted)
    .map(({ id, name, updatedAt, dirty }) => ({ id, name, updatedAt, dirty }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const thumbs: Record<string, string> = {}
  await Promise.all(
    models.map(async (m) => {
      const t = await getThumbnail(m.id).catch(() => undefined)
      if (t) thumbs[m.id] = t
    }),
  )
  lib().set({ models, thumbs })
}

/** Tar en ny bild av den öppna modellen, högst var THUMB_INTERVAL_MS om inte force. */
async function updateThumbnail(id: string, force = false) {
  // Med dolda delar blir bilden bara en del av modellen; ta den när allt syns igen.
  // Med ritningen öppen finns ingen 3D-vy att ta bilden i (den är stängd), och då togs bilden bort.
  const view = useViewStore.getState()
  if (view.hidden.length > 0 || view.isolated || view.drawing) return
  const now = Date.now()
  if (!force && lastThumb.id === id && now - lastThumb.at < THUMB_INTERVAL_MS) return
  lastThumb = { id, at: now }
  const url = captureThumbnail()
  // Tom modell: ingen bild, startvyn visar en platshållare.
  if (!url) {
    if (lib().thumbs[id]) {
      await deleteThumbnail(id)
      const { [id]: _gone, ...rest } = lib().thumbs
      void _gone
      lib().set({ thumbs: rest })
    }
    return
  }
  await putThumbnail(id, url)
  lib().set({ thumbs: { ...lib().thumbs, [id]: url } })
  unsentThumbs.add(id)
}

/**
 * Efter en synk: laddar upp bilder som tagits här, och hämtar bilder som saknas
 * här (eller är gamla) från servern. Så får en ny enhet bilder utan att öppna
 * varje modell. Bilderna synkas utan revisioner: den senaste som laddades upp gäller.
 */
async function syncThumbs() {
  for (const id of [...unsentThumbs]) {
    const url = await getThumbnail(id).catch(() => undefined)
    if (!url) {
      unsentThumbs.delete(id)
      continue
    }
    const r = await uploadThumbnail(id, url)
    if (r === 'failed') return
    if (r === 'ok') unsentThumbs.delete(id)
  }
  const { models, thumbs, currentId } = lib()
  for (const m of models) {
    // Den öppna modellens bild tas här, av det som syns.
    if (m.id === currentId) continue
    const wanted = staleThumbs.has(m.id) || (!thumbs[m.id] && !noServerThumb.has(m.id))
    if (!wanted) continue
    staleThumbs.delete(m.id)
    const url = await downloadThumbnail(m.id)
    if (!url) {
      noServerThumb.add(m.id)
      continue
    }
    await putThumbnail(m.id, url)
    lib().set({ thumbs: { ...lib().thumbs, [m.id]: url } })
  }
}

/** Laddar en lokal modell i storen utan att det räknas som en ändring. */
function showModel(m: LocalModel): boolean {
  const r = migrate(m.file)
  if (!r.ok) {
    lib().notify(`"${m.name}" går inte att öppna: ${r.reason}.`)
    return false
  }
  useToolStore.getState().setTool('select')
  // Dolda delar gäller modellen man tittade på, inte den som öppnas.
  useViewStore.getState().showAll()
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
  await updateThumbnail(currentId)
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
  const pending = lib().pendingDelete
  const next = (await repo.list())
    .filter((m) => !m.deleted && !pending.includes(m.id))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
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
        // Bilden här är av vår version, som nu är kopian; serverns bild hör till den andra.
        unsentThumbs.delete(e.id)
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
        staleThumbs.add(e.id)
        noServerThumb.delete(e.id)
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
      await refreshList()
      await syncThumbs()
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
  // Visa hela modellen när 3D-vyn kommit igång, direkt och utan att glida dit.
  useViewStore.getState().requestFit('all', { animate: false })
  if (current && !current.deleted) {
    lib().set({ opening: { id: current.id, name: current.name } })
    if (showModel(current)) return
    lib().set({ opening: null })
  }
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
  await deleteThumbnail(id).catch(() => {})
  if (id === lib().currentId) await openFallback()
  await refreshList()
  scheduleSync(0)
}

/**
 * Tar bort med ångra: modellen döljs direkt och tas bort på riktigt efter
 * UNDO_DELETE_MS. Stängs appen innan dess finns modellen kvar.
 */
export function deleteWithUndo(id: string) {
  const m = lib().models.find((x) => x.id === id)
  if (!m || deleteTimers.has(id)) return
  lib().set({ pendingDelete: [...lib().pendingDelete, id] })
  const notice = lib().notify(`”${m.name}” togs bort.`, { label: 'Ångra', run: () => undoDelete(id) })
  const timer = setTimeout(() => {
    deleteTimers.delete(id)
    lib().dismiss(notice)
    void deleteModel(id).finally(() => lib().set({ pendingDelete: lib().pendingDelete.filter((x) => x !== id) }))
  }, UNDO_DELETE_MS)
  deleteTimers.set(id, { timer, notice })
}

export function undoDelete(id: string) {
  const t = deleteTimers.get(id)
  if (!t) return
  clearTimeout(t.timer)
  deleteTimers.delete(id)
  lib().dismiss(t.notice)
  lib().set({ pendingDelete: lib().pendingDelete.filter((x) => x !== id) })
}

/** Kopia av en modell, med ny id och namnet "… kopia". Öppnas inte. */
export async function duplicateModel(id: string) {
  if (id === lib().currentId) await flushSave()
  const m = await repo.get(id)
  if (!m) return
  const names = new Set(lib().models.map((x) => x.name))
  let name = `${m.name} kopia`
  for (let n = 2; names.has(name); n++) name = `${m.name} kopia ${n}`
  const copy: LocalModel = {
    ...m,
    id: newId(),
    name,
    updatedAt: new Date().toISOString(),
    baseRevision: null,
    dirty: true,
    deleted: undefined,
  }
  await repo.put(copy)
  const thumb = await getThumbnail(id).catch(() => undefined)
  if (thumb) await putThumbnail(copy.id, thumb)
  await refreshList()
  scheduleSync(SYNC_DELAY_MS)
}

/** Går till startvyn. Tar först en bild utan markering, så att bilden blir ren. */
export async function showGallery() {
  useToolStore.getState().setTool('select')
  docs().select(null)
  // Vänta tills 3D-vyn ritats om utan markering.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  await persistNow()
  const { currentId } = lib()
  if (currentId) await updateThumbnail(currentId, true)
  lib().set({ screen: 'gallery' })
}

/** Öppnar en modell från startvyn (eller en ny) och går till den. */
/**
 * Väntar tills webbläsaren har ritat det som just ändrats, så att brickan
 * visar "Öppnar …" innan 3D-vyn räknar (det låser sidan en stund på en stor
 * modell). I en dold flik ritas inget; då går det vidare efter en stund ändå.
 */
const nextPaint = () =>
  new Promise<void>((resolve) => {
    const done = setTimeout(resolve, 200)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        clearTimeout(done)
        resolve()
      }),
    )
  })

export async function openFromGallery(id: string | 'new') {
  // Ett tryck till medan en modell öppnas gör ingenting.
  if (lib().opening) return
  // Den öppna modellen ligger redan ritad under startvyn, och en ny är tom: de öppnas direkt.
  if (id !== 'new' && id !== lib().currentId) {
    lib().set({ opening: { id, name: lib().models.find((m) => m.id === id)?.name ?? '' } })
    await nextPaint()
  }
  if (id === 'new') await createModel()
  else await openModel(id)
  lib().set({ screen: 'model' })
  // Kameran från förra modellen passar sällan; visa hela den här, direkt och utan att glida dit.
  useViewStore.getState().requestFit('all', { animate: false })
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
