import { useDocumentStore } from '../store/documentStore'
import { useToolStore, type Tool } from '../store/toolStore'

const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: 'select', label: 'Välj', key: 'Mellanslag' },
  { tool: 'rect', label: 'Rektangel', key: 'R' },
  { tool: 'pushpull', label: 'Push/pull', key: 'P' },
]

const button =
  'min-h-9 cursor-pointer whitespace-nowrap rounded-md border border-transparent px-3 narrow:min-h-11 narrow:px-2.5 disabled:cursor-default disabled:text-[#b5afa5]'

export function Toolbar() {
  const tool = useToolStore((s) => s.tool)
  const setTool = useToolStore((s) => s.setTool)
  const canUndo = useDocumentStore((s) => s.past.length > 0)
  const canRedo = useDocumentStore((s) => s.future.length > 0)
  const undo = useDocumentStore((s) => s.undo)
  const redo = useDocumentStore((s) => s.redo)

  return (
    <header className="flex justify-between gap-2 overflow-x-auto border-b border-line bg-panel px-2 py-1.5 pt-[max(6px,env(safe-area-inset-top))] [grid-area:toolbar]">
      <div className="flex gap-1" role="toolbar" aria-label="Verktyg">
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            aria-pressed={tool === t.tool}
            title={`${t.label} (${t.key})`}
            onClick={() => setTool(t.tool)}
            className={`${button} aria-pressed:border-accent-line aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <button
          className={button}
          disabled={!canUndo}
          title="Ångra (⌘Z)"
          onClick={() => {
            useToolStore.getState().setOp(null)
            undo()
          }}
        >
          Ångra
        </button>
        <button className={button} disabled={!canRedo} title="Gör om (⇧⌘Z)" onClick={redo}>
          Gör om
        </button>
      </div>
    </header>
  )
}
