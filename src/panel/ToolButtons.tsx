import { Circle, MousePointer2, Ruler, Square, type LucideIcon } from 'lucide-react'
import { useToolStore, type Tool } from '../store/toolStore'
import { useViewStore } from '../store/viewStore'
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
export function ToolButtons({ tipSide = 'bottom' }: { tipSide?: 'bottom' | 'left' }) {
  const tool = useToolStore((s) => s.tool)
  const setTool = useToolStore((s) => s.setTool)
  return TOOLS.map(({ tool: t, label, key, Icon }) => (
    <Tip key={t} label={label} keys={key} side={tipSide}>
      <button aria-pressed={tool === t} aria-label={label} onClick={() => setTool(t)} className={iconButton}>
        <Icon {...ICON} />
      </button>
    </Tip>
  ))
}

/**
 * Verktygen på smal skärm: en lodrät list vid högerkanten av 3D-vyn, där
 * tummen når och där de inte trängs med namnet i raden överst. I fokusläget
 * syns den också på bred skärm, eftersom raden överst då är dold.
 * Mitt på höjden, men aldrig högre än att den börjar under kameraknapparna
 * uppe till höger (13,5rem = deras höjd plus halva listens); annars täckte den
 * dem när vyn är låg.
 */
export function ToolRail() {
  const focusMode = useViewStore((s) => s.focusMode)
  const cover = useCoversView<HTMLDivElement>()
  return (
    <div
      ref={cover}
      role="toolbar"
      aria-label="Verktyg"
      aria-orientation="vertical"
      className={`absolute top-[max(50%,13.5rem)] right-2 -translate-y-1/2 flex-col gap-1 rounded-xl border border-line bg-panel/95 p-1 shadow-md narrow:flex ${focusMode ? 'flex' : 'hidden'}`}
    >
      <ToolButtons tipSide="left" />
    </div>
  )
}
