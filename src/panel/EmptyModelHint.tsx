import { Square } from 'lucide-react'
import { useDocumentStore } from '../store/documentStore'
import { useLibraryStore } from '../store/libraryStore'
import { useToolStore } from '../store/toolStore'
import { useViewStore } from '../store/viewStore'
import { primaryButton } from './ui'

/**
 * En tom modell: vad man gör först, mitt i 3D-vyn. På bred skärm med detaljpanelen öppen står
 * det redan där (NothingSelected); på telefon är bladet stängt och vyn visade bara ett rutnät.
 * Bara rutan tar emot tryck; runt den kan man börja rita direkt.
 */
export function EmptyModelHint() {
  const empty = useDocumentStore((s) => s.doc.instances.length === 0 && s.doc.sketches.length === 0)
  const tool = useToolStore((s) => s.tool)
  const setTool = useToolStore((s) => s.setTool)
  // Medan en modell öppnas är dokumentet tomt en stund; då ska rutan inte blinka till.
  const model = useLibraryStore((s) => s.screen === 'model' && !s.opening)
  const panelOpen = useViewStore((s) => s.panelOpen)
  const focusMode = useViewStore((s) => s.focusMode)
  if (!empty || !model || tool !== 'select') return null
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-1/3 justify-center px-4 narrow:pr-[4.75rem] narrow:pl-3 ${panelOpen && !focusMode ? 'hidden narrow:flex' : 'flex'}`}
    >
      <div className="pointer-events-auto flex max-w-xs animate-appear flex-col items-center gap-3 rounded-xl border border-line bg-panel/90 p-4 text-center shadow-lg backdrop-blur-md">
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-semibold">Börja med en skiss</p>
          <p className="text-[13px] text-muted">
            Rita en rektangel på golvet, och dra sedan ut den till en del med pilen.
          </p>
        </div>
        <button className={primaryButton} onClick={() => setTool('rect')}>
          <Square size={16} strokeWidth={1.75} aria-hidden />
          Rita en rektangel
        </button>
      </div>
    </div>
  )
}
