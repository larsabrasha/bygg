import { useState } from 'react'
import { arQuickLookSupported, openInAr } from '../scene/arExport'
import { useBodies } from '../store/documentStore'
import { secondaryButton } from './ui'

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
      <button
        className={`${secondaryButton} disabled:cursor-default disabled:opacity-50`}
        disabled={busy || bodies.length === 0}
        onClick={() => void open()}
      >
        {busy ? 'Förbereder AR…' : 'Visa i AR'}
      </button>
      {error && <p className="text-xs text-danger">Kunde inte öppna AR: {error}</p>}
    </>
  )
}
