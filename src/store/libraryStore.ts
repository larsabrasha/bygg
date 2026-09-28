import { create, type StoreApi } from 'zustand'

/**
 * En sida i Inställningar. Menu: öppnade från kugghjulet, utan en bestämd sida; på smal skärm
 * syns listan över sidorna, på bred Allmänt bredvid den.
 */
export type SettingsPage = 'menu' | 'general' | 'materials' | 'colors' | 'about'

export type SyncStatus = 'starting' | 'local-only' | 'syncing' | 'synced' | 'offline' | 'error' | 'logged-out' | 'guest'

export interface ModelListItem {
  id: string
  name: string
  updatedAt: string
  /** Har ändringar som inte har laddats upp. */
  dirty: boolean
  /** Exempelmodell utan konto (se LocalModel.example). */
  example?: boolean
}

/**
 * En modell i papperskorgen. where: local = bara i webbläsaren (utan konto, eller aldrig synkad);
 * server = i serverns papperskorg; pending = borttagen här men inte på servern än (nästa synk).
 */
export interface TrashListItem {
  id: string
  name: string
  deletedAt: string
  where: 'local' | 'server' | 'pending'
  thumb?: string
}

export interface Notice {
  id: string
  text: string
  action?: { label: string; run: () => void | Promise<void> }
  /**
   * Ligger kvar tills man stänger det: för det man måste se (en krockkopia, en sparning som inte gick).
   * Annars försvinner ett meddelande utan knapp av sig självt (se panel/Notices.tsx).
   */
  sticky?: boolean
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
  /** Stämpeln på den öppna modellen som den här fliken senast läste eller sparade (se LocalModel.stamp). */
  currentStamp?: string
  status: SyncStatus
  error: string | null
  notices: Notice[]
  /** Modellen som öppnas, tills 3D-vyn har ritat den (se OpenWatcher). */
  opening: { id: string; name: string } | null
  /** Inställningar är öppna, och på vilken sida (se SettingsSheet). */
  settings: SettingsPage | null
  /** Startvyn visar papperskorgen i stället för modellerna. */
  trashOpen: boolean
  /** Det som ligger i papperskorgen, senast borttaget först; null tills det lästs in. */
  trash: TrashListItem[] | null
  /** Serverns papperskorg gick inte att läsa (ingen kontakt); bara det som ligger här visas. */
  trashPartial: boolean
}

interface LibraryState extends LibrarySnapshot {
  set: (patch: Partial<LibrarySnapshot>) => void
  /** Visar ett meddelande och returnerar dess id. */
  notify: (text: string, action?: Notice['action'], options?: { sticky?: boolean }) => string
  dismiss: (id: string) => void
}

const previous = import.meta.hot?.data.libraryStore as StoreApi<LibraryState> | undefined
const initial: LibrarySnapshot = previous
  ? (({
      models,
      thumbs,
      screen,
      pendingDelete,
      currentId,
      currentName,
      currentBase,
      currentStamp,
      status,
      error,
      notices,
    }) => ({
      opening: null,
      settings: null,
      trashOpen: false,
      trash: null,
      trashPartial: false,
      models,
      thumbs: thumbs ?? {},
      screen: screen ?? 'model',
      pendingDelete: pendingDelete ?? [],
      currentId,
      currentName,
      currentBase,
      currentStamp,
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
      settings: null,
      trashOpen: false,
      trash: null,
      trashPartial: false,
    }

let noticeSeq = 0

export const useLibraryStore = create<LibraryState>()((set) => ({
  ...initial,
  set: (patch) => set(patch),
  notify: (text, action, options) => {
    const id = `n${++noticeSeq}`
    set((s) => ({ notices: [...s.notices, { id, text, action, ...(options?.sticky && { sticky: true }) }] }))
    return id
  },
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}))

if (import.meta.hot) import.meta.hot.data.libraryStore = useLibraryStore
