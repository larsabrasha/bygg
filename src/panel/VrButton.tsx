import { Glasses } from 'lucide-react'
import { useEffect, useState } from 'react'
import { vrSupported, xrStore } from '../scene/xr/xrStore'
import { MenuItem } from './MenuItem'

/**
 * Går in i VR (WebXR): modellen i verklig storlek, med handkontrollerna (se VrRig).
 * Syns bara där webbläsaren kan visa VR, t.ex. Chrome eller Edge på en PC med SteamVR.
 */
export function VrButton({ onOpened }: { onOpened: () => void }) {
  const [supported, setSupported] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void vrSupported().then((ok) => live && setSupported(ok))
    return () => {
      live = false
    }
  }, [])
  if (!supported) return null

  const enter = async () => {
    setError(null)
    try {
      await xrStore.enterVR()
      onOpened()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <MenuItem Icon={Glasses} onClick={() => void enter()} hint="I verklig storlek">
        Visa i VR
      </MenuItem>
      {error && <p className="px-3 text-xs text-danger">Kunde inte starta VR: {error}</p>}
    </>
  )
}
