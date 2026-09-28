import { del as idbDel, get as idbGet, isGuest, set as idbSet } from './localStore'
import { newId } from '../model/id'
import { LIMITS, modelLimitText } from '../model/limits'
import type { ModelDocument } from '../model/types'
import { migrate, serialize, type SavedFile } from '../persist/format'
import { useCatalogStore } from '../store/catalogStore'
import { emptyDocument, useDocumentStore } from '../store/documentStore'
import { useLibraryStore, type SyncStatus, type TrashListItem } from '../store/libraryStore'
import { useToolStore } from '../store/toolStore'
import { useViewStore } from '../store/viewStore'
import { ApiError, CLIENT_ID, httpApi } from './api'
import { forgetUser } from './auth'
import { loadCatalog, saveCatalog, syncCatalog } from './catalogSync'
import { conflictName, PREFETCH, syncOnce, type SyncEvent } from './engine'
import { modelLock, SYNC_LOCK, withLock } from './locks'
import { prefetched } from './prefetch'
import { idbRepo, importLegacy, LEGACY_KEY, type LocalModel } from './localRepo'
import { deleteHistory, getHistory, packHistory, putHistory, unpackHistory } from './history'
import { getLocalTrash, listLocalTrash, putLocalTrash, removeLocalTrash } from './localTrash'
import { parsePath, pathFor, type Route } from './route'
import {
  captureThumbnail,
  deleteThumbnail,
  downloadThumbnail,
  downloadTrashThumbnail,
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
/** Från att servern sagt att något ändrats (se connectEvents) tills synken börjar. Samlar ihop täta ändringar. */
const PUSH_DELAY_MS = 150
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
/** Varför den senaste sparningen här misslyckades (t.ex. full lagring), eller null. Visas tills en sparning lyckas. */
let saveError: string | null = null
/** Kanalen till andra flikar i samma webbläsare (se start). */
let tabs: BroadcastChannel | null = null
/** Modeller som inte går att läsa på servern och som redan fått ett meddelande i den här sessionen. */
const toldUnreadable = new Set<string>()
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
    .map(({ id, name, updatedAt, dirty, example }) => ({ id, name, updatedAt, dirty, ...(example && { example }) }))
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
  // Den öppna modellens bild tas här, av det som syns.
  const wanted = models.filter(
    (m) => m.id !== currentId && (staleThumbs.has(m.id) || (!thumbs[m.id] && !noServerThumb.has(m.id))),
  )
  // Flera på väg samtidigt, som modellerna (se syncOnce).
  const download = (m: (typeof wanted)[number]) => {
    staleThumbs.delete(m.id)
    return downloadThumbnail(m.id)
  }
  for await (const [m, url] of prefetched(wanted, PREFETCH, download)) {
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
  lib().set({ currentId: m.id, currentName: m.name, currentBase: m.baseRevision, currentStamp: m.stamp })
  void repo.setCurrentId(m.id)
  void restoreHistory(m, docs().doc)
  return true
}

const REMOTE_TEXT = (name: string) => `"${name}" ändrades på en annan enhet eller i CLI:t.`
const TAB_TEXT = (name: string) => `"${name}" ändrades i en annan flik.`

/**
 * Den öppna modellen har ändrats någon annanstans (en annan enhet, CLI:t, en annan flik) och har
 * inga egna osparade ändringar: visa den nya versionen. Verktyget, dolda delar och det valda ligger
 * kvar, så att man kan titta på medan CLI:t arbetar. Pågår en operation (man drar eller ritar)
 * väntar den tills operationen är klar, och bara om man inte ändrat något under tiden; newer säger
 * då om versionen som ligger lokalt fortfarande är en annans.
 */
function refreshCurrent(
  m: LocalModel,
  text = REMOTE_TEXT,
  newer: (latest: LocalModel) => boolean = (latest) => !latest.dirty,
) {
  if (useToolStore.getState().op) {
    const waiting = docs().doc
    const stop = useToolStore.subscribe((t) => {
      if (t.op) return
      stop()
      if (lib().currentId !== m.id || docs().doc !== waiting || waiting !== lastPersistedDoc) return
      void repo.get(m.id).then((latest) => latest && !latest.deleted && newer(latest) && refreshCurrent(latest, text, newer))
    })
    return
  }
  const r = migrate(m.file)
  if (!r.ok) {
    lib().notify(`"${m.name}" går inte att öppna: ${r.reason}.`)
    return
  }
  const selection = docs().selection
  docs().load(r.doc)
  lastPersistedDoc = docs().doc
  const list = selection?.kind === 'body' ? docs().doc.instances : docs().doc.sketches
  if (selection && list.some((x) => x.id === selection.id)) docs().select(selection)
  lib().set({ currentName: m.name, currentBase: m.baseRevision, currentStamp: m.stamp })
  notifyOnce(text(m.name))
}

function notifyOnce(text: string) {
  if (!lib().notices.some((n) => n.text === text)) lib().notify(text)
}

/**
 * Sätter tillbaka ångra-historiken som sparades med modellen här (se history.ts).
 * Bara om man inte hunnit ändra något eller öppna en annan modell under tiden.
 */
async function restoreHistory(m: LocalModel, loaded: ModelDocument) {
  const saved = await getHistory(m.id).catch(() => undefined)
  const h = unpackHistory(saved, m.file.savedAt)
  if (h && lib().currentId === m.id && docs().doc === loaded) docs().setHistory(h.past, h.future)
}

const STORAGE_FULL = 'Lagringen på enheten är full'
const isStorageFull = (e: unknown) => e instanceof DOMException && e.name === 'QuotaExceededError'

/** Skriver den öppna modellen till det lokala förrådet, om den ändrats. */
async function persistNow(force = false) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  const { currentId, currentName } = lib()
  const { doc, past, future } = docs()
  if (!currentId || (!force && doc === lastPersistedDoc)) return
  // Be om beständig lagring så att webbläsaren inte rensar modellerna vid platsbrist.
  // Först vid första sparningen: Firefox frågar användaren, och det ska inte ske vid sidladdning.
  if (!askedPersist) {
    askedPersist = true
    navigator.storage?.persist?.().catch(() => {})
  }
  const file = serialize(doc)
  let saved: { id: string; forkedFrom?: string }
  try {
    saved = await withLock(modelLock(currentId), () => writeCurrent(currentId, currentName, doc, file))
  } catch (e) {
    // Sparningen här gick inte (t.ex. full lagring). Ändringen finns bara i minnet: säg det, och
    // låt lastPersistedDoc vara, så att nästa sparning (efter nästa ändring eller synk) försöker igen.
    console.error('[bygg] Kunde inte spara modellen på enheten', e)
    saveError = isStorageFull(e) ? STORAGE_FULL : 'Kunde inte spara på enheten'
    lib().set({ status: 'error', error: saveError })
    notifyOnce(`${saveError}. Ändringarna finns bara i fönstret tills sparningen lyckas; stäng det inte.`)
    return
  }
  if (saveError) {
    saveError = null
    lib().set({ status: isGuest() ? 'guest' : 'synced', error: null })
  }
  if (saved.forkedFrom !== undefined) {
    void repo.setCurrentId(saved.id)
    lib().notify(
      `"${saved.forkedFrom}" hade ändrats i en annan flik eller på en annan enhet. Den versionen ligger kvar under sitt namn; din sparades som "${lib().currentName}".`,
    )
  }
  tabs?.postMessage({ id: saved.id })
  // Historiken hör till just den här sparningen (file.savedAt). Går den inte att spara ska
  // modellen ändå sparas; då går det bara inte att ångra efter omladdning.
  await putHistory(saved.id, packHistory(past, future, file.savedAt)).catch((e: unknown) =>
    console.warn('[bygg] Kunde inte spara ångra-historiken', e),
  )
  await updateThumbnail(saved.id).catch((e: unknown) => console.warn('[bygg] Kunde inte spara bilden', e))
  await refreshList()
  scheduleSync(SYNC_DELAY_MS)
}

/**
 * Skriver den öppna modellen, med låset för den (se locks.ts). Har någon annan skrivit modellen sedan
 * den här fliken läste den (stämpeln skiljer sig: en annan flik, eller synken som hämtat en nyare
 * version) skrivs den inte över. Då sparas vår version som en ny modell, som vid en krock på servern,
 * och fliken fortsätter i den. Allt som fliken minns om modellen sätts innan låset släpps, så att
 * nästa sparning jämför med rätt stämpel.
 */
async function writeCurrent(id: string, name: string, doc: ModelDocument, file: SavedFile) {
  const stored = await repo.get(id)
  const stamp = newId()
  const updatedAt = new Date().toISOString()
  // Har fliken hunnit öppna en annan modell gäller det den fliken minns inte längre den här.
  const stillOpen = () => lib().currentId === id
  if (stored && stored.stamp !== lib().currentStamp) {
    const copyId = newId()
    const copyName = conflictName(name, new Date())
    await repo.put({ id: copyId, name: copyName, file, updatedAt, baseRevision: null, dirty: true, stamp })
    if (stillOpen()) {
      lib().set({ currentId: copyId, currentName: copyName, currentBase: null, currentStamp: stamp })
      lastPersistedDoc = doc
    }
    return { id: copyId, forkedFrom: stored.name }
  }
  // Revisionen som det lokala bygger på: synken kan ha laddat upp det sedan fliken läste det.
  const baseRevision = stored ? stored.baseRevision : lib().currentBase
  await repo.put({ id, name, file, updatedAt, baseRevision, dirty: true, stamp })
  if (stillOpen()) {
    lib().set({ currentBase: baseRevision, currentStamp: stamp })
    lastPersistedDoc = doc
  }
  return { id }
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
  rejected: 'error',
  auth: 'logged-out',
}

async function openFallback() {
  const pending = lib().pendingDelete
  const next = (await repo.list())
    .filter((m) => !m.deleted && !pending.includes(m.id))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  if (next) showModel(next)
  else await createModel()
}

async function moveHistory(from: string, to: string) {
  const h = await getHistory(from).catch(() => undefined)
  if (h) await putHistory(to, h).catch(() => {})
  await deleteHistory(from).catch(() => {})
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
        // Historiken också: den följer vår version.
        await moveHistory(e.id, e.copyId)
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
          if (m) refreshCurrent(m)
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
      case 'rejected':
        lib().notify(`"${e.name}" kunde inte sparas på servern: ${e.reason}`)
        break
      case 'incompatible':
        lib().notify(`"${e.name}" är sparad med en nyare version av appen. Ladda om sidan för att uppdatera.`)
        break
      case 'unreadable':
        if (toldUnreadable.has(e.id)) break
        toldUnreadable.add(e.id)
        lib().notify(
          e.name === null
            ? 'En modell på servern går inte att läsa.'
            : `"${e.name}" går inte att läsa på servern. Kopian på den här enheten finns kvar.`,
        )
        break
    }
  }
}

/**
 * Synkar nu. Anrop under pågående synk ger en runda till efteråt. thumbs: false hoppar
 * över bilderna i startvyn (openInitial väntar inte på dem; start() synkar strax igen).
 */
export function syncNow({ thumbs = true }: { thumbs?: boolean } = {}): Promise<void> {
  if (syncing) {
    rerun = true
    return syncing
  }
  syncing = (async () => {
    // Utan konto finns ingen server att synka mot; allt ligger kvar i webbläsaren.
    if (isGuest()) {
      await persistNow()
      await saveCatalog()
      lib().set(saveError ? { status: 'error', error: saveError } : { status: 'guest', error: null })
      await refreshList()
      syncing = null
      return
    }
    try {
      do {
        rerun = false
        await persistNow()
        lib().set({ status: 'syncing', error: null })
        const docAtStart = docs().doc
        // En flik i taget: två flikar som laddar upp samma ändring skulle krocka med varandra.
        const { events, again } = await withLock(SYNC_LOCK, () =>
          syncOnce({ api, repo, newId, lock: (id, fn) => withLock(modelLock(id), fn) }),
        )
        await handle(events, docAtStart)
        // Användarens material och färger, i samma runda som modellerna.
        await syncCatalog(api)
        if (again) rerun = true
      } while (rerun)
      lib().set(saveError ? { status: 'error', error: saveError } : { status: 'synced', error: null })
      // Med kontakt och inloggning: lyssna på ändringar (igen, om strömmen stängts).
      connectEvents()
      await refreshList()
      // Det som väntade på att tas bort ligger nu i serverns papperskorg.
      if (lib().trashOpen && lib().trash?.some((i) => i.where === 'pending')) void loadTrash()
      if (thumbs) await syncThumbs()
    } catch (e) {
      if (e instanceof ApiError) lib().set({ status: STATUS_FOR[e.kind], error: e.message })
      else {
        console.error('[bygg] Synkfel', e)
        // En misslyckad sparning här är det användaren behöver veta; synkfelet följer oftast av den.
        lib().set({ status: 'error', error: saveError ?? (isStorageFull(e) ? STORAGE_FULL : String(e)) })
      }
    } finally {
      syncing = null
      await refreshList()
    }
  })()
  return syncing
}

/** Satt i gästens databas när exemplen lagts dit, så att de inte kommer tillbaka när man tagit bort dem. */
const EXAMPLES_KEY = 'bygg:examples'

/** Data-URL för en bild, som bilderna i startvyn sparas. */
async function dataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/**
 * Utan konto, första gången: några exempelmodeller att prova på (src/examples), märkta
 * som exempel. Den första i listan ligger överst; FIRST_OPEN öppnas under startvyn.
 */
async function addExamples() {
  if (await idbGet(EXAMPLES_KEY)) return
  const { EXAMPLES, FIRST_OPEN } = await import('../examples')
  const now = Date.now()
  let open: string | null = null
  for (const [i, e] of EXAMPLES.entries()) {
    const r = migrate(e.file)
    if (!r.ok) continue
    const id = newId()
    await repo.put({
      id,
      name: e.name,
      file: serialize(r.doc),
      // En minut isär, så att de står i den ordning de har i EXAMPLES.
      updatedAt: new Date(now - i * 60_000).toISOString(),
      baseRevision: null,
      dirty: false,
      example: true,
    })
    await putThumbnail(id, await dataUrl(e.thumb)).catch(() => {})
    if (e.name === FIRST_OPEN) open = id
  }
  if (open) await repo.setCurrentId(open)
  await idbSet(EXAMPLES_KEY, true)
}

/** Öppnar senast använda modell vid start (och flyttar över den gamla enkelmodellen första gången). */
export async function openInitial() {
  await loadCatalog().catch((e) => console.warn('[bygg] Kunde inte läsa material och färger', e))
  if (isGuest()) await addExamples().catch((e) => console.warn('[bygg] Kunde inte lägga till exemplen', e))
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

  // Visa hela modellen när 3D-vyn kommit igång, direkt och utan att glida dit.
  useViewStore.getState().requestFit('all', { animate: false })

  // Adressen avgör vyn. Under startsidan öppnas senast använda modell, så att den går fort att öppna igen.
  const route = parsePath(location.pathname)
  if (route.screen === 'model') {
    let wanted = await repo.get(route.id)
    // Länken kan gälla en modell som bara finns på servern än så länge.
    if (!wanted || wanted.deleted) {
      await syncNow()
      wanted = await repo.get(route.id)
    }
    if (wanted && !wanted.deleted) {
      // Med ritningen öppen finns ingen 3D-vy som kan stänga "Öppnar …" (se OpenWatcher).
      if (!route.drawing) lib().set({ opening: { id: wanted.id, name: wanted.name } })
      if (showModel(wanted)) {
        if (route.drawing) useViewStore.getState().setDrawing(true)
        return
      }
      lib().set({ opening: null })
    } else lib().notify('Modellen finns inte, eller har tagits bort.')
  }
  lib().set({ screen: 'gallery' })

  const currentId = await repo.getCurrentId().catch(() => null)
  const current = currentId ? await repo.get(currentId) : undefined
  // Ingen "Öppnar …" här: modellen ritas under startsidan, och brickan ska inte se upptagen ut.
  if (current && !current.deleted && showModel(current)) return
  // Ny enhet: hämta från servern först, så att vi inte laddar upp en tom modell i onödan.
  // Utan bilderna: appen visas utan att vänta på dem, och start() synkar direkt efteråt.
  if ((await repo.list()).length === 0) await syncNow({ thumbs: false })
  await openFallback()
}

export async function openModel(id: string) {
  if (id === lib().currentId) return
  await flushSave()
  const m = await repo.get(id)
  if (m) showModel(m)
}

/** Sant, och ett meddelande, om kontot redan har så många modeller som det får ha (se model/limits). */
function atModelLimit(): boolean {
  if (lib().models.length < LIMITS.models) return false
  const text = modelLimitText()
  if (!lib().notices.some((n) => n.text === text)) lib().notify(text)
  return true
}

/** Ny tom modell, som öppnas. False om kontot redan har så många modeller som det får ha. */
export async function createModel(): Promise<boolean> {
  if (atModelLimit()) return false
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
  // Man börjar rita: skuggat syns kanterna och ytorna tydligast, utan trätexturen.
  useViewStore.getState().setLook('shaded')
  await refreshList()
  scheduleSync(SYNC_DELAY_MS)
  return true
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

/** Sant för en modell utan skisser och delar: i papperskorgen finns inget att ta tillbaka. */
function isEmpty(m: LocalModel): boolean {
  const r = migrate(m.file)
  return r.ok && r.doc.sketches.length === 0 && r.doc.instances.length === 0
}

/**
 * Lägger modellen i papperskorgen. Finns den på servern tas den bort där vid nästa synk och
 * hamnar i serverns papperskorg; annars i webbläsarens (localTrash). En tom modell raderas direkt.
 */
export async function deleteModel(id: string) {
  await flushSave()
  const m = await repo.get(id)
  if (!m) return
  if (m.baseRevision === null) {
    if (!isEmpty(m)) {
      const thumb = await getThumbnail(id).catch(() => undefined)
      await putLocalTrash({ model: { ...m, deleted: undefined }, deletedAt: new Date().toISOString(), thumb })
    }
    await repo.remove(id)
  } else await repo.put({ ...m, deleted: true })
  await deleteThumbnail(id).catch(() => {})
  await deleteHistory(id).catch(() => {})
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
  const notice = lib().notify(`”${m.name}” flyttades till papperskorgen.`, {
    label: 'Ångra',
    run: () => undoDelete(id),
  })
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

/**
 * Läser in papperskorgen till startvyn: webbläsarens, det som väntar på att tas bort på servern,
 * och serverns. Utan kontakt med servern visas det som finns här (trashPartial). Bilderna från
 * serverns papperskorg hämtas efteråt, en i taget.
 */
export async function loadTrash() {
  const now = new Date()
  const items: TrashListItem[] = (await listLocalTrash(now).catch(() => [])).map((t) => ({
    id: t.model.id,
    name: t.model.name,
    deletedAt: t.deletedAt,
    where: 'local',
    thumb: t.thumb,
  }))
  for (const m of await repo.list())
    if (m.deleted) items.push({ id: m.id, name: m.name, deletedAt: now.toISOString(), where: 'pending' })
  let partial = false
  if (!isGuest()) {
    try {
      const known = new Set(items.map((i) => i.id))
      for (const t of await api.listTrash()) if (!known.has(t.id)) items.push({ ...t, where: 'server' })
    } catch (e) {
      // Utan synkserver (bara statiska filer) finns ingen papperskorg där att sakna.
      partial = !(e instanceof ApiError && e.kind === 'no-server')
    }
  }
  items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
  const shown = new Map((lib().trash ?? []).map((i) => [i.id, i.thumb]))
  for (const i of items) i.thumb ??= shown.get(i.id)
  lib().set({ trash: items, trashPartial: partial })
  for (const i of items) {
    if (i.where !== 'server' || i.thumb) continue
    const thumb = await downloadTrashThumbnail(i.id)
    if (thumb) lib().set({ trash: lib().trash?.map((x) => (x.id === i.id ? { ...x, thumb } : x)) ?? null })
  }
}

/** Öppnar eller stänger papperskorgen i startvyn. */
export function showTrash(open: boolean) {
  lib().set({ trashOpen: open })
  if (open) void loadTrash()
}

/** Ett meddelande när servern inte gick att nå för det man bad om i papperskorgen. */
function trashFailed(e: unknown) {
  if (!(e instanceof ApiError)) throw e
  lib().notify(e.kind === 'offline' ? 'Ingen kontakt med servern. Försök igen om en stund.' : e.message)
}

/** Tar tillbaka modellen ur papperskorgen, till modellerna. */
export async function restoreFromTrash(id: string) {
  const item = lib().trash?.find((i) => i.id === id)
  if (!item) return
  try {
    if (item.where === 'pending') {
      const m = await repo.get(id)
      if (m) await repo.put({ ...m, deleted: undefined })
    } else if (item.where === 'local') {
      if (atModelLimit()) return
      const t = await getLocalTrash(id)
      if (t) {
        await repo.put(t.model)
        if (t.thumb) await putThumbnail(id, t.thumb).catch(() => {})
        await removeLocalTrash(id)
      }
    } else {
      const r = await api.restore(id)
      if (!r.ok) lib().notify(r.reason === 'full' ? r.message : `”${item.name}” finns inte kvar i papperskorgen.`)
      // Hämtas som vilken modell som helst från servern.
      else await syncNow()
    }
  } catch (e) {
    trashFailed(e)
  }
  await refreshList()
  await loadTrash()
  scheduleSync(SYNC_DELAY_MS)
}

/** Raderar modellerna ur papperskorgen för gott. */
export async function deleteForever(ids: readonly string[]) {
  const items = (lib().trash ?? []).filter((i) => ids.includes(i.id))
  try {
    // Det som väntar på servern ska dit först; sedan raderas det där.
    if (items.some((i) => i.where === 'pending')) await syncNow()
    for (const i of items) {
      if (i.where === 'local') await removeLocalTrash(i.id)
      else await api.purge(i.id)
    }
  } catch (e) {
    trashFailed(e)
  }
  await loadTrash()
}

/**
 * En ny modell från en av exempelmodellerna (src/examples), märkt som exempel, och öppnar den.
 * Finns namnet redan får den en siffra efter. Med konto laddas den upp som vilken modell som helst.
 */
export async function createFromExample(name: string) {
  if (atModelLimit()) return
  const { EXAMPLES } = await import('../examples')
  const e = EXAMPLES.find((x) => x.name === name)
  const r = e && migrate(e.file)
  if (!e || !r?.ok) return
  const names = new Set(lib().models.map((m) => m.name))
  let unique = e.name
  for (let n = 2; names.has(unique); n++) unique = `${e.name} ${n}`
  const id = newId()
  await repo.put({
    id,
    name: unique,
    file: serialize(r.doc),
    updatedAt: new Date().toISOString(),
    baseRevision: null,
    dirty: !isGuest(),
    example: true,
  })
  await putThumbnail(id, await dataUrl(e.thumb)).catch(() => {})
  await refreshList()
  scheduleSync(SYNC_DELAY_MS)
  await openFromGallery(id)
}

/** Kopia av en modell, med ny id och namnet "… kopia". Öppnas inte. */
export async function duplicateModel(id: string) {
  if (atModelLimit()) return
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
    // Kopian är ens egen.
    example: undefined,
  }
  await repo.put(copy)
  const thumb = await getThumbnail(id).catch(() => undefined)
  if (thumb) await putThumbnail(copy.id, thumb)
  await refreshList()
  scheduleSync(SYNC_DELAY_MS)
}

/**
 * Lägger till en modell från en fil. Finns namnet redan får den en siffra efter. Returnerar dess id,
 * eller null om kontot redan har så många modeller som det får ha.
 */
export async function importModel(name: string, doc: ModelDocument): Promise<string | null> {
  if (atModelLimit()) return null
  const names = new Set(lib().models.map((x) => x.name))
  let unique = name
  for (let n = 2; names.has(unique); n++) unique = `${name} ${n}`
  const m: LocalModel = {
    id: newId(),
    name: unique,
    file: serialize(doc),
    updatedAt: new Date().toISOString(),
    baseRevision: null,
    dirty: true,
  }
  await repo.put(m)
  await refreshList()
  scheduleSync(SYNC_DELAY_MS)
  return m.id
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
  if (id === 'new') {
    if (!(await createModel())) return
  } else await openModel(id)
  lib().set({ screen: 'model', trashOpen: false })
  // Kameran från förra modellen passar sällan; visa hela den här, direkt och utan att glida dit.
  useViewStore.getState().requestFit('all', { animate: false })
}

/** Går till vyn som adressen pekar på, efter bakåt eller framåt i webbläsaren. */
async function follow(route: Route) {
  const view = useViewStore.getState()
  if (route.screen === 'gallery') {
    // Från ritningen: 3D-vyn är stängd och har ingen bild att ge; i ritningen ändras inget heller.
    if (view.drawing) {
      view.setDrawing(false)
      lib().set({ screen: 'gallery' })
    } else if (lib().screen !== 'gallery') await showGallery()
    return
  }
  if (!route.drawing) view.setDrawing(false)
  if (route.id !== lib().currentId || lib().screen !== 'model') {
    const m = await repo.get(route.id)
    if (!m || m.deleted || lib().pendingDelete.includes(route.id)) {
      lib().notify('Modellen finns inte, eller har tagits bort.')
      return
    }
    view.setDrawing(false)
    await openFromGallery(route.id)
    // Med ritningen öppen stängs inte "Öppnar …" av 3D-vyn (se OpenWatcher).
    if (route.drawing) lib().set({ opening: null })
  }
  if (route.drawing) view.setDrawing(true)
}

/**
 * Håller adressen i takt med vyn (se route.ts). Byte mellan startsidan, en
 * modell och ritningen blir ett nytt steg i historiken, så att bakåt fungerar.
 * Går man i appen tillbaka dit man kom ifrån (t.ex. stänger ritningen) går
 * historiken bakåt i stället, så att den inte fylls på med fram och tillbaka.
 * Byter den öppna modellen id (t.ex. vid en krock) skrivs adressen bara om.
 */
function startRouting(): () => void {
  // Medan bakåt/framåt följs är adressen redan den nya; skriv inte över den på vägen.
  let following = false
  // history.back() är begärd men popstate har inte kommit än.
  let goingBack = false
  const write = (push: boolean) => {
    if (goingBack) return
    const { screen, currentId } = lib()
    const path = pathFor(screen, currentId, useViewStore.getState().drawing)
    if (path === location.pathname) return
    const url = path + location.search + location.hash
    const state = history.state as { prev?: string } | null
    if (push && state?.prev === path) {
      goingBack = true
      history.back()
    } else if (push) history.pushState({ prev: location.pathname }, '', url)
    else history.replaceState(state, '', url)
  }
  write(false)
  const unsubscribeLib = useLibraryStore.subscribe((s, prev) => {
    if (following) return
    if (s.screen !== prev.screen) write(true)
    else if (s.currentId !== prev.currentId) write(false)
  })
  const unsubscribeView = useViewStore.subscribe((s, prev) => {
    if (!following && s.drawing !== prev.drawing) write(true)
  })
  const onPopState = () => {
    if (goingBack) {
      goingBack = false
      write(false)
      return
    }
    following = true
    void follow(parsePath(location.pathname)).finally(() => {
      following = false
      // Gick det inte att följa (t.ex. borttagen modell) visar adressen det som faktiskt syns.
      write(false)
    })
  }
  window.addEventListener('popstate', onPopState)
  return () => {
    unsubscribeLib()
    unsubscribeView()
    window.removeEventListener('popstate', onPopState)
  }
}

/** Loggar ut. Sparar det som går till servern först; modellerna ligger kvar på enheten till nästa inloggning. */
export async function logout() {
  await saveNow()
  await syncNow()
  try {
    const r = await fetch('/auth/logout', { method: 'POST' })
    const { redirect } = (await r.json()) as { redirect: string }
    disconnectEvents()
    await forgetUser()
    location.assign(redirect)
  } catch {
    lib().notify('Det går inte att logga ut utan kontakt med servern.')
  }
}

let events: EventSource | null = null
let eventsConnected = false

/**
 * Lyssnar på serverns ändringar (/api/events): när en annan flik, enhet eller CLI:t sparat
 * synkar appen direkt, i stället för vid nästa runda (SYNC_INTERVAL_MS). Strömmen återansluter
 * själv efter ett avbrott; nekas den (utloggad) öppnas den igen efter nästa lyckade synk.
 */
function connectEvents() {
  if (isGuest() || typeof EventSource === 'undefined') return
  if (events && events.readyState !== EventSource.CLOSED) return
  const source = new EventSource('/api/events')
  events = source
  source.addEventListener('ready', () => {
    // Efter ett avbrott kan ändringar ha missats.
    if (eventsConnected) scheduleSync(PUSH_DELAY_MS)
    eventsConnected = true
  })
  source.addEventListener('change', (m: MessageEvent<string>) => {
    let kind: string | undefined
    try {
      const e = JSON.parse(m.data) as { by?: string; kind?: string }
      if (e.by === CLIENT_ID) return
      kind = e.kind
    } catch {
      // Okänd händelse: synka ändå.
    }
    if (kind === 'trash') {
      // Bara papperskorgen ändrades (en annan enhet tömde den, eller tog tillbaka något: då kommer
      // också en ändring av modellen). Läses om om den visas.
      if (lib().trashOpen) void loadTrash()
      return
    }
    scheduleSync(PUSH_DELAY_MS)
  })
  source.addEventListener('error', () => {
    if (source.readyState === EventSource.CLOSED && events === source) events = null
  })
}

function disconnectEvents() {
  events?.close()
  events = null
  eventsConnected = false
}

/** Startar autospar och bakgrundssynk. Returnerar en funktion som stänger av dem. */
export function start(): () => void {
  // Efter HMR finns dokumentet redan; räkna det som sparat så att det inte sparas i onödan.
  lastPersistedDoc ??= docs().doc
  const unsubscribe = useDocumentStore.subscribe((s, prev) => {
    if (s.doc !== prev.doc && s.doc !== lastPersistedDoc) scheduleSave()
  })
  // En ändrad lista med material och färger sparas direkt och synkas strax efter, som en modell.
  const unsubscribeCatalog = useCatalogStore.subscribe((s, prev) => {
    if (!s.dirty || s.catalog === prev.catalog) return
    void saveCatalog().catch((e) => console.warn('[bygg] Kunde inte spara material och färger', e))
    scheduleSync(SYNC_DELAY_MS)
  })
  const stopRouting = startRouting()
  // En annan flik har sparat en modell: visa den nya versionen om den är öppen här utan egna ändringar.
  // Har den här fliken egna ändringar märks krocken när de sparas (se writeCurrent).
  tabs = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('bygg:models')
  tabs?.addEventListener('message', (e: MessageEvent<{ id?: unknown }>) => {
    const id = e.data?.id
    if (typeof id === 'string') void fromOtherTab(id)
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
    unsubscribeCatalog()
    stopRouting()
    clearInterval(interval)
    if (syncTimer) clearTimeout(syncTimer)
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onPageHide)
    disconnectEvents()
    tabs?.close()
    tabs = null
    void persistNow()
  }
}

async function fromOtherTab(id: string) {
  await refreshList()
  if (id !== lib().currentId || docs().doc !== lastPersistedDoc) return
  const m = await repo.get(id)
  const newer = (latest: LocalModel) => latest.stamp !== lib().currentStamp
  if (m && !m.deleted && newer(m)) refreshCurrent(m, TAB_TEXT, newer)
}
