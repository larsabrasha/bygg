import { useDocumentStore } from './store/documentStore'
import { useLibraryStore } from './store/libraryStore'
import { useToolStore } from './store/toolStore'
import { openInitial, start } from './sync/session'

/**
 * Uppstart som berör storarna: öppna modell, autospar och synk, dev-kroken.
 * Ligger i en egen modul som accepterar HMR själv. Annars skulle en ändring
 * i en store bubbla upp till main.tsx och ge full omladdning, och sparningen
 * skulle fortsätta lyssna på den gamla storen.
 */

// Öppna modell bara vid riktig sidladdning; vid HMR har storen redan datan.
if (!import.meta.hot?.data.loaded) {
  await openInitial()
  if (import.meta.hot) import.meta.hot.data.loaded = true
}

const stop = start()

// Service worker bara i produktionsbygget; i dev skulle den cacha bort HMR.
if (import.meta.env.PROD) void import('./pwa').then((m) => m.startPwa())

// Bara i dev: gör storarna åtkomliga från konsolen för felsökning och webbläsartester.
if (import.meta.env.DEV)
  Object.assign(window, { __bygg: { docs: useDocumentStore, tools: useToolStore, library: useLibraryStore } })

if (import.meta.hot) {
  import.meta.hot.accept()
  import.meta.hot.dispose(stop)
}
