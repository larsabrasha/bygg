import { X } from 'lucide-react'
import { resolveBodies } from '../model/resolve'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import { Tip } from './Tip'
import { iconAction } from './ui'

/**
 * Efter Skär ut eller Lägg till i knappraden: tala om att nästa tryck väljer
 * verktyget. Längst ner i vyn, där måttrutan annars ligger.
 */
export function CombineBar() {
  const combining = useToolStore((s) => s.combining)
  const setCombining = useToolStore((s) => s.setCombining)
  const doc = useDocumentStore((s) => s.doc)
  if (!combining) return null
  const host = resolveBodies(doc).find((b) => b.id === combining.host)
  if (!host) return null
  const text =
    combining.op === 'subtract'
      ? `Tryck på delen som ska skäras ut ur ${host.name}.`
      : `Tryck på delen som ska läggas till på ${host.name}.`
  return (
    <div
      role="status"
      className="absolute bottom-3 left-1/2 flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-xl border border-line bg-panel/90 p-2 pl-3 shadow-lg backdrop-blur-md"
    >
      <div className="flex flex-col">
        <p className="text-[13px]">{text}</p>
        {combining.error && <p className="text-xs text-danger">{combining.error}</p>}
      </div>
      <Tip label="Avbryt" keys="Esc" side="top">
        <button
          type="button"
          aria-label="Avbryt"
          onClick={() => setCombining(null)}
          className={`${iconAction} text-muted hover:bg-hover`}
        >
          <X size={18} strokeWidth={2} aria-hidden />
        </button>
      </Tip>
    </div>
  )
}
