import { ArrowUpFromLine, MousePointer2, Move, Redo2, Square, Undo2, type LucideIcon } from 'lucide-react'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore, type Tool } from '../store/toolStore'
import { ModelMenu } from './ModelMenu'

const TOOLS: { tool: Tool; label: string; key: string; Icon: LucideIcon }[] = [
  { tool: 'select', label: 'Välj', key: 'Mellanslag', Icon: MousePointer2 },
  { tool: 'rect', label: 'Rektangel', key: 'R', Icon: Square },
  { tool: 'pushpull', label: 'Push/pull', key: 'P', Icon: ArrowUpFromLine },
  { tool: 'move', label: 'Flytta', key: 'M', Icon: Move },
]

/** Kvadratisk ikonknapp: 36 px på desktop, 44 px (touchyta) på smal skärm. */
const button =
  'grid size-9 shrink-0 cursor-pointer place-items-center rounded-md border border-transparent hover:bg-hover narrow:size-11 disabled:cursor-default disabled:text-disabled disabled:hover:bg-transparent'

const ICON = { size: 20, strokeWidth: 1.75, 'aria-hidden': true } as const

export function Toolbar() {
  const tool = useToolStore((s) => s.tool)
  const setTool = useToolStore((s) => s.setTool)
  const canUndo = useDocumentStore((s) => s.past.length > 0)
  const canRedo = useDocumentStore((s) => s.future.length > 0)
  const undo = useDocumentStore((s) => s.undo)
  const redo = useDocumentStore((s) => s.redo)

  return (
    // Knapparna visar bara ikoner; namnet finns i aria-label (skärmläsare) och title (tooltip med kortkommando).
    <header className="flex items-center gap-2 border-b border-line bg-panel px-2 py-1.5 pt-[max(6px,env(safe-area-inset-top))] [grid-area:toolbar] narrow:gap-1">
      <div className="max-w-64 min-w-0 narrow:flex-1">
        <ModelMenu />
      </div>
      <div className="flex gap-1" role="toolbar" aria-label="Verktyg">
        {TOOLS.map(({ tool: t, label, key, Icon }) => (
          <button
            key={t}
            aria-pressed={tool === t}
            aria-label={label}
            title={`${label} (${key})`}
            onClick={() => setTool(t)}
            className={`${button} aria-pressed:border-accent-line aria-pressed:bg-accent-soft aria-pressed:text-accent`}
          >
            <Icon {...ICON} />
          </button>
        ))}
      </div>
      <div className="ml-auto flex gap-1">
        <button
          className={button}
          disabled={!canUndo}
          aria-label="Ångra"
          title="Ångra (⌘Z)"
          onClick={() => {
            useToolStore.getState().setOp(null)
            undo()
          }}
        >
          <Undo2 {...ICON} />
        </button>
        <button className={button} disabled={!canRedo} aria-label="Gör om" title="Gör om (⇧⌘Z)" onClick={redo}>
          <Redo2 {...ICON} />
        </button>
      </div>
    </header>
  )
}
