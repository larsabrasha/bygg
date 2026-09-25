import { Printer, X } from 'lucide-react'
import { useLibraryStore } from '../store/libraryStore'
import { useViewStore } from '../store/viewStore'
import { setExploded } from '../tools/actions'
import { printExploded } from './explodeActions'
import { Tip } from './Tip'
import { bottomBox, ghostButton, iconAction } from './ui'
import { useCoversView } from './useCoversView'

/** Längst ner i vyn i sprängskissen: hur långt isär, skriv ut och stäng. */
export function ExplodeBar() {
  const exploded = useViewStore((s) => s.exploded)
  const amount = useViewStore((s) => s.explodeAmount)
  const setAmount = useViewStore((s) => s.setExplodeAmount)
  const modelName = useLibraryStore((s) => s.currentName)
  const cover = useCoversView<HTMLDivElement>()
  if (!exploded) return null
  return (
    <div ref={cover} role="group" aria-label="Sprängskiss" className={`${bottomBox} flex items-center gap-2 pl-3`}>
      <label className="flex items-center gap-2 text-[13px] font-medium">
        Sprängskiss
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.05}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          aria-label="Hur långt isär"
          className="w-36 accent-accent narrow:w-24"
        />
      </label>
      <button type="button" className={ghostButton} onClick={() => void printExploded(modelName)}>
        <Printer size={16} strokeWidth={1.75} aria-hidden />
        <span className="narrow:hidden">Skriv ut</span>
      </button>
      <Tip label="Stäng sprängskissen" keys="Esc" side="top">
        <button
          type="button"
          aria-label="Stäng sprängskissen"
          onClick={() => setExploded(false)}
          className={`${iconAction} text-muted hover:bg-hover`}
        >
          <X size={18} strokeWidth={2} aria-hidden />
        </button>
      </Tip>
    </div>
  )
}
