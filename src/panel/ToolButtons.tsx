import { Circle, MousePointer2, PenLine, Ruler, Square, type LucideIcon } from 'lucide-react'
import { useToolStore, type Tool } from '../store/toolStore'
import { useViewStore } from '../store/viewStore'
import { RedoButton, UndoButton } from './HistoryButtons'
import { Tip } from './Tip'
import { ICON, iconButton } from './ui'
import { useCoversView } from './useCoversView'

const TOOLS: { tool: Tool; label: string; key: string; Icon: LucideIcon }[] = [
  { tool: 'select', label: 'Välj', key: 'Mellanslag', Icon: MousePointer2 },
  { tool: 'rect', label: 'Rektangel', key: 'R', Icon: Square },
  { tool: 'circle', label: 'Cirkel', key: 'C', Icon: Circle },
  { tool: 'measure', label: 'Mät', key: 'T', Icon: Ruler },
]

/** Välj, Rektangel, Cirkel och Mät. Namnet finns i aria-label (skärmläsare) och i tooltipen med kortkommandot. */
export function ToolButtons({
  tipSide = 'bottom',
  buttonClass = iconButton,
}: {
  tipSide?: 'bottom' | 'left'
  buttonClass?: string
}) {
  const tool = useToolStore((s) => s.tool)
  const setTool = useToolStore((s) => s.setTool)
  const penMode = useViewStore((s) => s.penMode)
  const setPenMode = useViewStore((s) => s.setPenMode)
  return (
    <>
      {TOOLS.map(({ tool: t, label, key, Icon }) => (
        <Tip key={t} label={label} keys={key} side={tipSide}>
          <button aria-pressed={tool === t} aria-label={label} onClick={() => setTool(t)} className={buttonClass}>
            <Icon {...ICON} />
          </button>
        </Tip>
      ))}
      {/* Pennläget: syns bara när det är på (pennan slog på det). Ett tryck slår av det, så att fingrarna ritar igen. */}
      {penMode && (
        <Tip label="Pennläge: fingrarna ritar inte. Tryck för att slå av." side={tipSide}>
          <button aria-pressed aria-label="Slå av pennläge" onClick={() => setPenMode(false)} className={buttonClass}>
            <PenLine {...ICON} />
          </button>
        </Tip>
      )}
    </>
  )
}

/**
 * Knapp i verktygslisten: som iconButton, men den krymper (ner till 32 px) när listen inte
 * får plats på höjden, t.ex. på telefon med bladet öppet.
 */
const railButton =
  'grid h-9 min-h-8 w-9 shrink cursor-pointer place-items-center rounded-lg hover:bg-hover aria-pressed:bg-accent-soft aria-pressed:text-accent narrow:h-11 narrow:w-11 disabled:cursor-default disabled:text-disabled disabled:hover:bg-transparent'

/**
 * Verktygen på smal skärm: en lodrät list vid högerkanten av 3D-vyn, där
 * tummen når och där de inte trängs med namnet i raden överst. I fokusläget
 * syns den också på bred skärm, eftersom raden överst då är dold.
 * Sist, efter ett streck, Ångra och Gör om (bara när det finns något att göra om):
 * raden överst har dem bara på bred skärm.
 * Mitt i ytan mellan kameraknapparna uppe till höger (Visa allt och Vy) och vyns nederkant,
 * så att den aldrig täcker dem. Räcker inte höjden krymper knapparna.
 */
export function ToolRail() {
  const focusMode = useViewStore((s) => s.focusMode)
  const cover = useCoversView<HTMLDivElement>()
  return (
    <div
      className={`pointer-events-none absolute top-[3.75rem] right-2 bottom-2 flex-col justify-center narrow:top-[7rem] narrow:flex ${focusMode ? 'flex' : 'hidden'}`}
    >
      <div
        ref={cover}
        role="toolbar"
        aria-label="Verktyg"
        aria-orientation="vertical"
        className="pointer-events-auto flex min-h-0 flex-col gap-1 rounded-xl border border-line bg-panel/95 p-1 shadow-md"
      >
        <ToolButtons tipSide="left" buttonClass={railButton} />
        <div role="separator" className="mx-1.5 h-px shrink-0 bg-line" />
        <UndoButton tipSide="left" buttonClass={railButton} />
        <RedoButton tipSide="left" buttonClass={railButton} onlyWhenAvailable />
      </div>
    </div>
  )
}
