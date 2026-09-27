import { create, type StoreApi } from 'zustand'
import { emptyCatalog, specOf, type Catalog, type CatalogColor, type CatalogMaterial } from '../model/catalog'
import { newId } from '../model/id'
import { setCustomMaterials, type MaterialSpec } from '../model/materials'
import { useDocumentStore } from './documentStore'

/**
 * Användarens material och färger (se model/catalog). Sparas lokalt och synkas
 * av sync/catalogSync; här finns listan och ändringarna.
 */

type MaterialFields = Omit<MaterialSpec, 'id'>
type ColorFields = Omit<CatalogColor, 'id' | 'updatedAt'>

interface CatalogState {
  catalog: Catalog
  /** Räknas upp vid varje ändring, så att det som ritar ett material (BodyMesh) vet när det ska ritas om. */
  version: number
  /** Serverns revision som listan bygger på; null = aldrig uppladdad. */
  baseRevision: number | null
  /** Ändrad sedan den laddades upp senast. */
  dirty: boolean

  addMaterial: (fields: MaterialFields) => string
  updateMaterial: (id: string, fields: Partial<MaterialFields>) => void
  removeMaterial: (id: string) => void
  /** Visar eller döljer ett inbyggt material i väljaren. */
  setHidden: (id: string, hidden: boolean) => void
  /** Visar eller döljer flera inbyggda på en gång (Alla), som en ändring. */
  setHiddenMany: (ids: readonly string[], hidden: boolean) => void
  addColor: (fields: ColorFields) => string
  updateColor: (id: string, fields: Partial<ColorFields>) => void
  removeColor: (id: string) => void
  /** Listan från lagringen eller servern. dirty: har ändringar som servern inte har. */
  replace: (catalog: Catalog, baseRevision: number | null, dirty: boolean) => void
}

const previous = import.meta.hot?.data.catalogStore as StoreApi<CatalogState> | undefined
const now = () => new Date().toISOString()

export const useCatalogStore = create<CatalogState>()((set, get) => {
  /** En ändring av listan: sparas och synkas (sync/catalogSync lyssnar på dirty och version). */
  const change = (patch: (c: Catalog, at: string) => Catalog) =>
    set((s) => ({ catalog: patch(s.catalog, now()), version: s.version + 1, dirty: true }))

  return {
    catalog: previous?.getState().catalog ?? emptyCatalog(),
    version: (previous?.getState().version ?? 0) + 1,
    baseRevision: previous?.getState().baseRevision ?? null,
    dirty: previous?.getState().dirty ?? false,

    addMaterial: (fields) => {
      const id = newId()
      change((c, at) => ({ ...c, materials: [...c.materials, { ...fields, id, updatedAt: at }] }))
      return id
    },
    updateMaterial: (id, fields) =>
      change((c, at) => ({
        ...c,
        materials: c.materials.map((m) =>
          m.id === id ? ({ ...m, ...fields, id, updatedAt: at } as CatalogMaterial) : m,
        ),
      })),
    removeMaterial: (id) =>
      change((c, at) => ({
        ...c,
        materials: c.materials.filter((m) => m.id !== id),
        removed: { ...c.removed, [id]: at },
      })),
    setHidden: (id, hidden) => get().setHiddenMany([id], hidden),
    setHiddenMany: (ids, hidden) => {
      const current = get().catalog.hidden
      const next = hidden ? [...new Set([...current, ...ids])] : current.filter((h) => !ids.includes(h))
      if (next.length === current.length && next.every((h) => current.includes(h))) return
      change((c, at) => ({ ...c, hidden: next, hiddenAt: at }))
    },
    addColor: (fields) => {
      const id = newId()
      change((c, at) => ({ ...c, colors: [...c.colors, { ...fields, id, updatedAt: at }] }))
      return id
    },
    updateColor: (id, fields) =>
      change((c, at) => ({
        ...c,
        colors: c.colors.map((x) => (x.id === id ? { ...x, ...fields, id, updatedAt: at } : x)),
      })),
    removeColor: (id) =>
      change((c, at) => ({ ...c, colors: c.colors.filter((x) => x.id !== id), removed: { ...c.removed, [id]: at } })),
    replace: (catalog, baseRevision, dirty) => set((s) => ({ catalog, baseRevision, dirty, version: s.version + 1 })),
  }
})

if (import.meta.hot) import.meta.hot.data.catalogStore = useCatalogStore

/**
 * Egna material för uppslag (materialSpec): användarens lista före den öppna
 * modellens kopior. När listan ändras får modellen nya kopior (refreshMaterials).
 */
let lastDocMaterials: readonly MaterialSpec[] | undefined
function applyCustom() {
  const docMaterials = useDocumentStore.getState().doc.materials ?? []
  lastDocMaterials = useDocumentStore.getState().doc.materials
  setCustomMaterials([...useCatalogStore.getState().catalog.materials.map(specOf), ...docMaterials])
}
applyCustom()
const unsubscribeCatalog = useCatalogStore.subscribe((s, prev) => {
  if (s.catalog === prev.catalog) return
  applyCustom()
  useDocumentStore.getState().refreshMaterials()
})
const unsubscribeDoc = useDocumentStore.subscribe((s) => {
  if (s.doc.materials !== lastDocMaterials) applyCustom()
})

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    unsubscribeCatalog()
    unsubscribeDoc()
  })
