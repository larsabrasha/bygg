import { registerSW } from 'virtual:pwa-register'
import { useLibraryStore } from './store/libraryStore'
import { saveNow } from './sync/session'

/**
 * Registrerar service workern (bara i produktionsbygget). Appen fungerar då
 * utan nät och kan installeras. En ny version aktiveras först när man väljer
 * "Ladda om", efter att den öppna modellen sparats.
 */
export function startPwa() {
  const updateSW = registerSW({
    onNeedRefresh() {
      useLibraryStore.getState().notify('En ny version av appen finns.', {
        label: 'Ladda om',
        run: async () => {
          await saveNow()
          await updateSW(true)
        },
      })
    },
    onOfflineReady() {
      useLibraryStore.getState().notify('Appen är sparad på enheten och fungerar nu utan nät.')
    },
  })
}
