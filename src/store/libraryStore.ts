import { create, type StoreApi } from 'zustand'

export type SyncStatus = 'starting' | 'local-only' | 'syncing' | 'synced' | 'offline' | 'error'

export interface ModelListItem {
  id: string
  name: string
  updatedAt: string
  /** Har ändringar som inte har laddats upp. */
  dirty: boolean
}

export interface Notice {
  id: string
  text: string
  action?: { label: string; run: () => void | Promise<void> }
}

interface LibrarySnapshot {
  models: ModelListItem[]
  currentId: string | null
  currentName: string
  /** Serverns revision som den öppna modellen bygger på (null = aldrig uppladdad). */
  currentBase: number | null
  status: SyncStatus
  error: string | null
  notices: Notice[]
}

interface LibraryState extends LibrarySnapshot {
  set: (patch: Partial<LibrarySnapshot>) => void
  notify: (text: string, action?: Notice['action']) => void
  dismiss: (id: string) => void
}

const previous = import.meta.hot?.data.libraryStore as StoreApi<LibraryState> | undefined
const initial: LibrarySnapshot = previous
  ? (({ models, currentId, currentName, currentBase, status, error, notices }) => ({
      models,
      currentId,
      currentName,
      currentBase,
      status,
      error,
      notices,
    }))(previous.getState())
  : { models: [], currentId: null, currentName: '', currentBase: null, status: 'starting', error: null, notices: [] }

let noticeSeq = 0

export const useLibraryStore = create<LibraryState>()((set) => ({
  ...initial,
  set: (patch) => set(patch),
  notify: (text, action) => set((s) => ({ notices: [...s.notices, { id: `n${++noticeSeq}`, text, action }] })),
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}))

if (import.meta.hot) import.meta.hot.data.libraryStore = useLibraryStore
