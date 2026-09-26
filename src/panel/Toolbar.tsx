import { DraftingCompass, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useBodies } from '../store/documentStore'
import { useViewStore } from '../store/viewStore'
import { RedoButton, UndoButton } from './HistoryButtons'
import { ModelTitle } from './ModelTitle'
import { ShareMenu } from './ShareMenu'
import { SyncBadge } from './SyncBadge'
import { Tip } from './Tip'
import { ToolButtons } from './ToolButtons'
import { ICON, iconButton } from './ui'

export function Toolbar() {
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
      {/*
        Ångra och gör om hör till arbetet med modellen, så de står efter verktygen. På smal skärm
        står de sist i verktygslisten i 3D-vyn (ToolRail).
      */}
      <span aria-hidden className="mx-2 h-6 w-px shrink-0 bg-line narrow:hidden" />
      <div className="flex gap-1 narrow:hidden" role="group" aria-label="Historik">
        <UndoButton />
        <RedoButton />
      </div>
      {/* Synkstatus (bara när något är fel), Ritning och Dela, och detaljpanelen längst till höger, med luft emellan. */}
      <div className="ml-auto flex shrink-0 items-center gap-4 narrow:gap-2">
        <SyncBadge withLabel={false} />
        <div className="flex items-center gap-1">
          <DrawingButton />
          <ShareMenu buttonClass={iconButton} />
        </div>
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

/**
 * Ritningen (med kaplistan som sista blad). Fylld men dämpad knapp med text, så att den
 * syns utan att ta över. Texten står kvar också på smal skärm: passaren ensam säger inte vad knappen gör.
 */
function DrawingButton() {
  const empty = useBodies().length === 0
  return (
    <Tip label="Ritning" keys="⌘P">
      <button
        className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-button px-3 text-[13px] font-medium text-ink hover:bg-hover disabled:cursor-default disabled:text-disabled disabled:hover:bg-button narrow:h-11"
        disabled={empty}
        onClick={() => useViewStore.getState().setDrawing(true)}
      >
        <DraftingCompass size={18} strokeWidth={1.75} aria-hidden />
        Ritning
      </button>
    </Tip>
  )
}
