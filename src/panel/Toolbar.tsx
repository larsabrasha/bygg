import { Redo2, Undo2 } from 'lucide-react'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import { ModelTitle } from './ModelTitle'
import { ShareMenu } from './ShareMenu'
import { ToolButtons } from './ToolButtons'
import { ICON, iconButton } from './ui'

export function Toolbar() {
  const canUndo = useDocumentStore((s) => s.past.length > 0)
  const canRedo = useDocumentStore((s) => s.future.length > 0)
  const undo = useDocumentStore((s) => s.undo)
  const redo = useDocumentStore((s) => s.redo)

  return (
    <header className="flex items-center gap-2 border-b border-line bg-panel px-2 py-1.5 pt-[max(6px,env(safe-area-inset-top))] [grid-area:toolbar] narrow:gap-1 narrow:pl-1">
      <div className="max-w-72 min-w-0 narrow:max-w-none narrow:flex-1">
        <ModelTitle />
      </div>
      {/* På smal skärm ligger verktygen i en list i 3D-vyn (ToolRail). */}
      <div className="flex gap-1 narrow:hidden" role="toolbar" aria-label="Verktyg">
        <ToolButtons />
      </div>
      {/* Ångra och gör om i en egen grupp; Dela längst till höger, med luft emellan. */}
      <div className="ml-auto flex shrink-0 items-center gap-4 narrow:gap-2">
        <div className="flex gap-1" role="group" aria-label="Historik">
          <button
            className={iconButton}
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
          <button className={iconButton} disabled={!canRedo} aria-label="Gör om" title="Gör om (⇧⌘Z)" onClick={redo}>
            <Redo2 {...ICON} />
          </button>
        </div>
        <ShareMenu buttonClass={iconButton} />
      </div>
    </header>
  )
}
