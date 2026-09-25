import { del, get, keys, set } from 'idb-keyval'
import { migrate, type SavedFile } from '../persist/format'
import type { ServerModel } from './protocol'

/** En modell som den ligger lokalt i webbläsaren. */
export interface LocalModel {
  id: string
  name: string
  file: SavedFile
  /** Senaste lokala ändring (eller serverns tid när den hämtades). */
  updatedAt: string
  /** Serverns revision som den lokala versionen bygger på. Null = aldrig uppladdad. */
  baseRevision: number | null
  /** Sant om den lokala versionen har ändringar som servern inte har. */
  dirty: boolean
  /** Borttagen lokalt, väntar på att servern ska ta bort den. */
  deleted?: boolean
}

export interface LocalRepo {
  list(): Promise<LocalModel[]>
  get(id: string): Promise<LocalModel | undefined>
  put(model: LocalModel): Promise<void>
  remove(id: string): Promise<void>
  getCurrentId(): Promise<string | null>
  setCurrentId(id: string): Promise<void>
}

export function fromServer(m: ServerModel): LocalModel {
  return { id: m.id, name: m.name, file: m.file, updatedAt: m.updatedAt, baseRevision: m.revision, dirty: false }
}

const PREFIX = 'bygg:model:'
const CURRENT = 'bygg:current-id'
/** Nyckeln från när det bara fanns en modell (före synk). */
export const LEGACY_KEY = 'bygg:current'

export function idbRepo(): LocalRepo {
  return {
    async list() {
      const ks = (await keys()).filter((k): k is string => typeof k === 'string' && k.startsWith(PREFIX))
      const models = await Promise.all(ks.map((k) => get<LocalModel>(k)))
      return models.filter((m): m is LocalModel => !!m)
    },
    get: (id) => get<LocalModel>(PREFIX + id),
    put: (m) => set(PREFIX + m.id, m),
    remove: (id) => del(PREFIX + id),
    getCurrentId: async () => (await get<string>(CURRENT)) ?? null,
    setCurrentId: (id) => set(CURRENT, id),
  }
}

export function memoryRepo(initial: LocalModel[] = []): LocalRepo & { models: Map<string, LocalModel> } {
  const models = new Map(initial.map((m) => [m.id, m]))
  let current: string | null = null
  return {
    models,
    list: async () => [...models.values()],
    get: async (id) => models.get(id),
    put: async (m) => {
      models.set(m.id, structuredClone(m))
    },
    remove: async (id) => {
      models.delete(id)
    },
    getCurrentId: async () => current,
    setCurrentId: async (id) => {
      current = id
    },
  }
}

/**
 * Flyttar modellen från den gamla enkelnyckeln till modellistan, en gång.
 * Den gamla nyckeln lämnas kvar som säkerhetskopia men läses inte igen.
 */
export async function importLegacy(
  repo: LocalRepo,
  readLegacy: () => Promise<unknown>,
  markImported: () => Promise<void>,
  newId: () => string,
  now = () => new Date(),
): Promise<string | null> {
  const raw = await readLegacy()
  if (raw === undefined) return null
  const r = migrate(raw)
  await markImported()
  if (!r.ok) return null
  const id = newId()
  const file = raw as SavedFile
  await repo.put({
    id,
    name: 'Min modell',
    file: { ...file, doc: r.doc },
    updatedAt: now().toISOString(),
    baseRevision: null,
    dirty: true,
  })
  return id
}
