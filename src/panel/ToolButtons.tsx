import { MousePointer2, Ruler, Square, type LucideIcon } from 'lucide-react'
import { useToolStore, type Tool } from '../store/toolStore'
import { useViewStore } from '../store/viewStore'
import { ICON, iconButton } from './ui'

const TOOLS: { tool: Tool; label: string; key: string; Icon: LucideIcon }[] = [
  { tool: 'select', label: 'Välj', key: 'Mellanslag', Icon: MousePointer2 },
  { tool: 'rect', label: 'Rektangel', key: 'R', Icon: Square },
  { tool: 'measure', label: 'Mät', key: 'T', Icon: Ruler },
]

/** Välj, Rektangel och Mät. Namnet finns i aria-label (skärmläsare) och title (tooltip med kortkommando). */
export function ToolButtons() {
  const tool = useToolStore((s) => s.tool)
  const setTool = useToolStore((s) => s.setTool)
  return TOOLS.map(({ tool: t, label, key, Icon }) => (
    <button
      key={t}
      aria-pressed={tool === t}
      aria-label={label}
      title={`${label} (${key})`}
      onClick={() => setTool(t)}
      className={iconButton}
    >
      <Icon {...ICON} />
    </button>
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
      <ToolButtons />
    </div>
  )
}
