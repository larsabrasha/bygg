import { ArrowUpFromLine, Copy, Focus, Trash2, X, type LucideIcon } from 'lucide-react'
import { resolveBodies } from '../model/resolve'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import { useViewStore } from '../store/viewStore'
import { beginPushPull } from '../tools/actions'

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const

function BarButton({
  label,
  Icon,
  onClick,
  danger = false,
}: {
  label: string
  Icon: LucideIcon
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-2 hover:bg-hover narrow:size-11 narrow:justify-center narrow:px-0 ${danger ? 'text-danger' : ''}`}
    >
      <Icon {...ICON} />
      {/* På smal skärm bara ikonen; namnet finns i aria-label. */}
      <span className="text-[13px] narrow:hidden">{label}</span>
    </button>
  )
}

/**
 * Det man oftast gör med det valda, direkt i 3D-vyn: på mobil slipper man
 * öppna bladet. Uppe till vänster; uppe till höger ligger "Visa allt".
 */
export function SelectionBar() {
  const selection = useDocumentStore((s) => s.selection)
  const doc = useDocumentStore((s) => s.doc)
  const select = useDocumentStore((s) => s.select)
  const deleteSelection = useDocumentStore((s) => s.deleteSelection)
  const duplicateLinked = useDocumentStore((s) => s.duplicateLinked)
  const requestFit = useViewStore((s) => s.requestFit)
  const opActive = useToolStore((s) => s.op !== null)

  if (!selection || opActive) return null
  const body = selection.kind === 'body' ? resolveBodies(doc).find((b) => b.id === selection.id) : undefined
  if (selection.kind === 'body' && !body) return null

  return (
    <div
      role="toolbar"
      aria-label="Det valda"
      className="absolute top-3 left-3 flex max-w-[calc(100%-80px)] items-center gap-0.5 rounded-lg border border-line bg-panel/95 p-0.5 shadow-md"
    >
      <span className="truncate px-2 text-[13px] font-semibold narrow:max-w-20">{body ? body.name : 'Skiss'}</span>
      {body ? (
        <>
          <BarButton label="Zooma till" Icon={Focus} onClick={() => requestFit('selection')} />
          <BarButton label="Länkad kopia" Icon={Copy} onClick={() => duplicateLinked(body.id)} />
        </>
      ) : (
        <BarButton label="Dra ut" Icon={ArrowUpFromLine} onClick={() => beginPushPull(selection.id)} />
      )}
      <BarButton label="Ta bort" Icon={Trash2} onClick={deleteSelection} danger />
      <BarButton label="Avmarkera" Icon={X} onClick={() => select(null)} />
    </div>
  )
}
