import { useState } from 'react'
import { arQuickLookSupported, openInAr } from '../scene/arExport'
import { useBodies } from '../store/documentStore'
import { useLibraryStore } from '../store/libraryStore'

const supported = arQuickLookSupported()

/**
 * Visar modellen i verklig storlek med AR Quick Look, bara på enheter som har det (iPhone, iPad).
 * available = false där det inte går, eller när modellen är tom. Ett fel visas som en notis.
 */
export function useAr() {
  const bodies = useBodies()
  const [busy, setBusy] = useState(false)
  const open = async (onDone?: () => void) => {
    setBusy(true)
    try {
      await openInAr(bodies)
    } catch (e) {
      useLibraryStore.getState().notify(`Kunde inte öppna AR: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
      onDone?.()
    }
  }
  return { supported, available: bodies.length > 0, busy, open }
}
