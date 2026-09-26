import { useEffect, useState } from 'react'
import { vrAvailable, xrStore } from '../scene/xr/xrStore'
import { useLibraryStore } from '../store/libraryStore'

/** Sant när webbläsaren kan visa VR, t.ex. Chrome eller Edge på en PC med SteamVR. */
export function useVrAvailable(): boolean {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let live = true
    void vrAvailable.then((ok) => live && setAvailable(ok))
    return () => {
      live = false
    }
  }, [])
  return available
}

/** Går in i VR (WebXR): modellen i verklig storlek, med handkontrollerna (se VrRig). */
export async function enterVr() {
  try {
    await xrStore.enterVR()
  } catch (e) {
    useLibraryStore.getState().notify(`Kunde inte starta VR: ${e instanceof Error ? e.message : String(e)}`)
  }
}
