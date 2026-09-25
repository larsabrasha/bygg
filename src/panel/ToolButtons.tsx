import { MousePointer2, Square, type LucideIcon } from 'lucide-react'
import { useToolStore, type Tool } from '../store/toolStore'
import { ICON, iconButton } from './ui'

const TOOLS: { tool: Tool; label: string; key: string; Icon: LucideIcon }[] = [
  { tool: 'select', label: 'Välj', key: 'Mellanslag', Icon: MousePointer2 },
  { tool: 'rect', label: 'Rektangel', key: 'R', Icon: Square },
]

/** Välj och Rektangel. Namnet finns i aria-label (skärmläsare) och title (tooltip med kortkommando). */
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
 * tummen når och där de inte trängs med namnet i raden överst.
 */
export function ToolRail() {
  return (
    <div
      role="toolbar"
      aria-label="Verktyg"
      aria-orientation="vertical"
      className="absolute top-1/2 right-2 hidden -translate-y-1/2 flex-col gap-1 rounded-xl border border-line bg-panel/95 p-1 shadow-md narrow:flex"
    >
      <ToolButtons />
    </div>
  )
}
