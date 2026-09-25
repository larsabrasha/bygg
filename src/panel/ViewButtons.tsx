import { Maximize } from 'lucide-react'
import { useViewStore } from '../store/viewStore'

/** Knappar ovanpå 3D-vyn för kameran. Uppe till höger, så att de inte krockar med måttfältet på mobil. */
export function ViewButtons() {
  const requestFit = useViewStore((s) => s.requestFit)
  return (
    <div className="absolute top-3 right-3 flex flex-col gap-1">
      <button
        aria-label="Visa allt"
        title="Visa allt (⇧Z)"
        onClick={() => requestFit('all')}
        className="grid size-9 cursor-pointer place-items-center rounded-md border border-line bg-panel/95 shadow-md hover:bg-hover narrow:size-11"
      >
        <Maximize size={20} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  )
}
