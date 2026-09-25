import { House, Maximize2, Minimize2 } from 'lucide-react'
import { useViewStore } from '../store/viewStore'

/**
 * Knappar ovanpå 3D-vyn för kameran. Uppe till höger, så att de inte krockar med måttfältet på mobil.
 * Visa allt har text på desktop, så att den inte ser ut som fullskärm; på smal skärm bara huset.
 * Till höger om den (under den på smal skärm, där raden uppe till vänster behöver bredden): fokusläget (Tab), bara 3D-vyn. Knappen behövs där det inte finns något tangentbord.
 */
export function ViewButtons() {
  const requestFit = useViewStore((s) => s.requestFit)
  const focusMode = useViewStore((s) => s.focusMode)
  const toggleFocusMode = useViewStore((s) => s.toggleFocusMode)
  const FocusIcon = focusMode ? Minimize2 : Maximize2
  return (
    <div className="absolute top-3 right-3 flex gap-1 narrow:flex-col">
      <button
        aria-label="Visa allt"
        title="Visa hela modellen (⇧Z)"
        onClick={() => requestFit('all')}
        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-panel/95 px-2.5 text-[13px] font-medium shadow-md hover:bg-hover narrow:size-11 narrow:justify-center narrow:px-0"
      >
        <House size={18} strokeWidth={1.75} aria-hidden />
        <span className="narrow:hidden">Visa allt</span>
      </button>
      <button
        aria-label={focusMode ? 'Avsluta fokusläge' : 'Fokusläge'}
        aria-pressed={focusMode}
        title={focusMode ? 'Visa panelerna igen (Tab)' : 'Fokusläge: bara 3D-vyn (Tab)'}
        onClick={toggleFocusMode}
        className="grid size-9 cursor-pointer place-items-center rounded-lg bg-panel/95 shadow-md hover:bg-hover aria-pressed:bg-accent-soft aria-pressed:text-accent narrow:size-11"
      >
        <FocusIcon size={18} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  )
}
