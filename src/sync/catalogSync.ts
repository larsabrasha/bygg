import { cleanCatalog, mergeCatalogs, type Catalog } from '../model/catalog'
import { useCatalogStore } from '../store/catalogStore'
import type { CatalogApi } from './api'
import { get, set } from './localStore'

/**
 * Användarens material och färger mellan storen, den lokala lagringen och
 * servern. Listan är en enda fil per användare med revisioner, som modellerna.
 * Krockar slås ihop post för post (mergeCatalogs) i stället för att bli en kopia:
 * två enheter som lagt till var sin färg ska båda få båda.
 */

export interface LocalCatalog {
  catalog: Catalog
  baseRevision: number | null
  dirty: boolean
}

const KEY = 'bygg:catalog'

/** Så många försök att ladda upp efter en krock innan vi väntar till nästa runda. */
const MAX_ATTEMPTS = 3

const isEmpty = (c: Catalog) =>
  c.materials.length === 0 && c.colors.length === 0 && c.hidden.length === 0 && Object.keys(c.removed).length === 0

/**
 * En synkrunda för listan: ladda upp våra ändringar (slå ihop vid krock), annars
 * hämta serverns om den är nyare. Kastar ApiError utan kontakt; då ändras inget.
 */
export async function syncCatalogOnce(api: CatalogApi, local: LocalCatalog): Promise<LocalCatalog> {
  // Servern har tappat listan (eller aldrig haft den) men vi har en: ladda upp den som ny.
  if (!local.dirty) {
    const remote = await api.getCatalog()
    if (remote && remote.revision === local.baseRevision) return local
    if (remote) return { catalog: cleanCatalog(remote.catalog), baseRevision: remote.revision, dirty: false }
    if (isEmpty(local.catalog)) return { ...local, baseRevision: null }
    local = { ...local, baseRevision: null, dirty: true }
  }
  let { catalog, baseRevision } = local
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const r = await api.putCatalog({ baseRevision, catalog })
    if (r.ok) return { catalog, baseRevision: r.revision, dirty: false }
    if (r.current) catalog = mergeCatalogs(cleanCatalog(r.current.catalog), catalog)
    baseRevision = r.current?.revision ?? null
  }
  return { catalog, baseRevision, dirty: true }
}

const store = () => useCatalogStore.getState()

/** Läser listan från den lokala lagringen till storen. Anropas när användaren (eller gästen) är vald. */
export async function loadCatalog() {
  const saved = await get<LocalCatalog>(KEY).catch(() => undefined)
  if (!saved) return store().replace(cleanCatalog(null), null, false)
  store().replace(cleanCatalog(saved.catalog), saved.baseRevision ?? null, saved.dirty === true)
}

/** Sparar storens lista lokalt. */
export async function saveCatalog() {
  const { catalog, baseRevision, dirty } = store()
  await set(KEY, { catalog, baseRevision, dirty } satisfies LocalCatalog)
}

/**
 * Synkar listan och lägger in svaret i storen. Ändrades listan under tiden
 * slås svaret ihop med ändringen, som fortfarande behöver laddas upp.
 */
export async function syncCatalog(api: CatalogApi) {
  const start = store()
  const result = await syncCatalogOnce(api, {
    catalog: start.catalog,
    baseRevision: start.baseRevision,
    dirty: start.dirty,
  })
  const now = store()
  if (now.version === start.version) {
    if (result.catalog !== start.catalog || result.baseRevision !== start.baseRevision || result.dirty !== start.dirty)
      now.replace(result.catalog, result.baseRevision, result.dirty)
  } else now.replace(mergeCatalogs(result.catalog, now.catalog), result.baseRevision, true)
  await saveCatalog()
}
