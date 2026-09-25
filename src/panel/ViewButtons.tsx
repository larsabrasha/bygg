import { House } from 'lucide-react'
import { useViewStore } from '../store/viewStore'

/**
 * Knappar ovanpå 3D-vyn för kameran. Uppe till höger, så att de inte krockar med måttfältet på mobil.
 * Visa allt har text på desktop, så att den inte ser ut som fullskärm; på smal skärm bara huset.
 */
export function ViewButtons() {
  const requestFit = useViewStore((s) => s.requestFit)
  return (
    <div className="absolute top-3 right-3 flex flex-col gap-1">
      <button
        aria-label="Visa allt"
        title="Visa hela modellen (⇧Z)"
        onClick={() => requestFit('all')}
        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-panel/95 px-2.5 text-[13px] font-medium shadow-md hover:bg-hover narrow:size-11 narrow:justify-center narrow:px-0"
      >
        <House size={18} strokeWidth={1.75} aria-hidden />
        <span className="narrow:hidden">Visa allt</span>
      </button>
    </div>
  )
}
