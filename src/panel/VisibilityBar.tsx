import { Eye } from 'lucide-react'
import { resolveBodies } from '../model/resolve'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import { useViewStore } from '../store/viewStore'
import { Tip } from './Tip'
import { useCoversView } from './useCoversView'

/**
 * Att något är dolt eller isolerat, och en knapp som visar allt igen (som
 * "Show Hidden Items" i Shapr3D). Under raden för det valda, uppe till vänster.
 */
export function VisibilityBar() {
  const hidden = useViewStore((s) => s.hidden)
  const isolated = useViewStore((s) => s.isolated)
  const showAll = useViewStore((s) => s.showAll)
  const doc = useDocumentStore((s) => s.doc)
  const hasSelection = useDocumentStore((s) => s.selection !== null)
  const busy = useToolStore((s) => s.op !== null || s.combining !== null)
  const cover = useCoversView<HTMLDivElement>()
  // Bara delar som finns: efter Ta bort eller Ångra kan ett id ha försvunnit.
  const parts = resolveBodies(doc).filter((b) => !b.tool)
  const names = isolated ? parts.filter((b) => isolated.includes(b.id)).map((b) => b.name) : []
  const count = isolated ? parts.length - names.length : parts.filter((b) => hidden.includes(b.id)).length
  if (count === 0) return null
  const text = isolated
    ? `Isolerad: ${names.join(', ') || 'inget'}`
    : `${count} ${count === 1 ? 'del dold' : 'delar dolda'}`
  return (
    <div
      ref={cover}
      role="status"
      className={`absolute left-3 flex items-center gap-1 rounded-lg border border-line bg-panel/95 py-0.5 pr-0.5 pl-3 shadow-md ${hasSelection && !busy ? 'top-16 narrow:top-[4.25rem]' : 'top-3'}`}
    >
      <span className="text-[13px] text-muted">{text}</span>
      <Tip label="Visa alla delar igen" keys="⇧H">
        <button
          type="button"
          onClick={showAll}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium hover:bg-hover narrow:h-11"
        >
          <Eye size={16} strokeWidth={1.75} aria-hidden />
          Visa alla
        </button>
      </Tip>
    </div>
  )
}
