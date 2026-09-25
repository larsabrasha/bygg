import { PanelRightClose, PanelRightOpen, Redo2, Undo2 } from 'lucide-react'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import { useViewStore } from '../store/viewStore'
import { ModelTitle } from './ModelTitle'
import { ShareMenu } from './ShareMenu'
import { SyncBadge } from './SyncBadge'
import { Tip } from './Tip'
import { ToolButtons } from './ToolButtons'
import { ICON, iconButton } from './ui'

export function Toolbar() {
  const canUndo = useDocumentStore((s) => s.past.length > 0)
  const canRedo = useDocumentStore((s) => s.future.length > 0)
  const undo = useDocumentStore((s) => s.undo)
  const redo = useDocumentStore((s) => s.redo)
  const panelOpen = useViewStore((s) => s.panelOpen)
  const togglePanel = useViewStore((s) => s.togglePanel)
  const focusMode = useViewStore((s) => s.focusMode)

  return (
    <header
      className={`flex items-center ${focusMode ? 'hidden' : ''} gap-2 border-b border-line bg-panel px-2 py-1.5 pt-[max(6px,env(safe-area-inset-top))] [grid-area:toolbar] narrow:gap-1 narrow:pl-1`}
    >
      <div className="max-w-72 min-w-0 narrow:max-w-none narrow:flex-1">
        <ModelTitle />
      </div>
      {/* Modellen och verktygen är olika grupper: luft och en linje emellan, som i knappraderna i vyn. */}
      <span aria-hidden className="mx-2 h-6 w-px shrink-0 bg-line narrow:hidden" />
      {/* På smal skärm ligger verktygen i en list i 3D-vyn (ToolRail). */}
      <div className="flex gap-1 narrow:hidden" role="toolbar" aria-label="Verktyg">
        <ToolButtons />
      </div>
      {/* Synkstatus (bara när något är fel), ångra och gör om i en egen grupp, Dela, och detaljpanelen längst till höger, med luft emellan. */}
      <div className="ml-auto flex shrink-0 items-center gap-4 narrow:gap-2">
        <SyncBadge withLabel={false} />
        <div className="flex gap-1" role="group" aria-label="Historik">
          <Tip label="Ångra" keys="⌘Z">
            <button
              className={iconButton}
              disabled={!canUndo}
              aria-label="Ångra"
              onClick={() => {
                useToolStore.getState().setOp(null)
                undo()
              }}
            >
              <Undo2 {...ICON} />
            </button>
          </Tip>
          <Tip label="Gör om" keys="⇧⌘Z">
            <button className={iconButton} disabled={!canRedo} aria-label="Gör om" onClick={redo}>
              <Redo2 {...ICON} />
            </button>
          </Tip>
        </div>
        <ShareMenu buttonClass={iconButton} />
        {/*
          Detaljpanelen i en egen grupp längst till höger, rakt ovanför panelen
          (som i Xcode och VS Code). Bara på bred skärm; på smal är den ett blad längst ner.
        */}
        <span aria-hidden className="h-6 w-px shrink-0 bg-line narrow:hidden" />
        <Tip label={panelOpen ? 'Dölj detaljpanelen' : 'Visa detaljpanelen'}>
          <button
            className={`${iconButton} narrow:hidden`}
            aria-expanded={panelOpen}
            aria-label="Detaljpanel"
            onClick={togglePanel}
          >
            {panelOpen ? <PanelRightClose {...ICON} /> : <PanelRightOpen {...ICON} />}
          </button>
        </Tip>
      </div>
    </header>
  )
}
