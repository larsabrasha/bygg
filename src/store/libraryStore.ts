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
  /** Bild av varje modell (data-URL), per id. Saknas för modeller som inte öppnats på enheten. */
  thumbs: Record<string, string>
  /** Startvyn med alla modeller, eller den öppna modellen. */
  screen: 'gallery' | 'model'
  /** Modeller som tagits bort men går att ångra några sekunder; visas inte. */
  pendingDelete: string[]
  currentId: string | null
  currentName: string
  /** Serverns revision som den öppna modellen bygger på (null = aldrig uppladdad). */
  currentBase: number | null
  status: SyncStatus
  error: string | null
  notices: Notice[]
  /** Modellen som öppnas, tills 3D-vyn har ritat den (se OpenWatcher). */
  opening: { id: string; name: string } | null
}

interface LibraryState extends LibrarySnapshot {
  set: (patch: Partial<LibrarySnapshot>) => void
  /** Visar ett meddelande och returnerar dess id. */
  notify: (text: string, action?: Notice['action']) => string
  dismiss: (id: string) => void
}

const previous = import.meta.hot?.data.libraryStore as StoreApi<LibraryState> | undefined
const initial: LibrarySnapshot = previous
  ? (({ models, thumbs, screen, pendingDelete, currentId, currentName, currentBase, status, error, notices }) => ({
      opening: null,
      models,
      thumbs: thumbs ?? {},
      screen: screen ?? 'model',
      pendingDelete: pendingDelete ?? [],
      currentId,
      currentName,
      currentBase,
      status,
      error,
      notices,
    }))(previous.getState())
  : {
      models: [],
      thumbs: {},
      screen: 'model',
      pendingDelete: [],
      currentId: null,
      currentName: '',
      currentBase: null,
      status: 'starting',
      error: null,
      notices: [],
      opening: null,
    }

let noticeSeq = 0

export const useLibraryStore = create<LibraryState>()((set) => ({
  ...initial,
  set: (patch) => set(patch),
  notify: (text, action) => {
    const id = `n${++noticeSeq}`
    set((s) => ({ notices: [...s.notices, { id, text, action }] }))
    return id
  },
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}))

if (import.meta.hot) import.meta.hot.data.libraryStore = useLibraryStore
