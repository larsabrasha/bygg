import { MousePointer2, Ruler, Square, type LucideIcon } from 'lucide-react'
import { useToolStore, type Tool } from '../store/toolStore'
import { useViewStore } from '../store/viewStore'
import { Tip } from './Tip'
import { ICON, iconButton } from './ui'

const TOOLS: { tool: Tool; label: string; key: string; Icon: LucideIcon }[] = [
  { tool: 'select', label: 'Välj', key: 'Mellanslag', Icon: MousePointer2 },
  { tool: 'rect', label: 'Rektangel', key: 'R', Icon: Square },
  { tool: 'measure', label: 'Mät', key: 'T', Icon: Ruler },
]

/** Välj, Rektangel och Mät. Namnet finns i aria-label (skärmläsare) och i tooltipen med kortkommandot. */
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
 */
export function ToolRail() {
  const focusMode = useViewStore((s) => s.focusMode)
  return (
    <div
      role="toolbar"
      aria-label="Verktyg"
      aria-orientation="vertical"
      className={`absolute top-1/2 right-2 -translate-y-1/2 flex-col gap-1 rounded-xl border border-line bg-panel/95 p-1 shadow-md narrow:flex ${focusMode ? 'flex' : 'hidden'}`}
    >
      <ToolButtons tipSide="left" />
    </div>
  )
}
