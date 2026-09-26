import { Rotate3d } from 'lucide-react'
import { useState } from 'react'
import { arQuickLookSupported, openInAr } from '../scene/arExport'
import { useBodies } from '../store/documentStore'
import { MenuItem } from './MenuItem'

const supported = arQuickLookSupported()

/** Visar modellen i verklig storlek med AR Quick Look. Syns bara på enheter som har det (iPhone, iPad). */
export function ArButton({ onOpened }: { onOpened: () => void }) {
  const bodies = useBodies()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!supported) return null

  const open = async () => {
    setBusy(true)
    setError(null)
    try {
      await openInAr(bodies)
      onOpened()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <MenuItem Icon={Rotate3d} disabled={busy || bodies.length === 0} onClick={() => void open()}>
        {busy ? 'Förbereder AR…' : 'Visa i AR'}
      </MenuItem>
      {error && <p className="px-3 text-xs text-danger">Kunde inte öppna AR: {error}</p>}
    </>
  )
}
