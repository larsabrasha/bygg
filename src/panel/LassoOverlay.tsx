import { useToolStore } from '../store/toolStore'

/** Slingan man ritar runt delar för att välja dem (se ToolController), ovanpå 3D-vyn. */
export function LassoOverlay() {
  const path = useToolStore((s) => s.lasso)
  if (!path) return null
  return (
    <svg className="pointer-events-none fixed inset-0 z-30 size-full" aria-hidden>
      <polygon
        points={path.map(([x, y]) => `${x},${y}`).join(' ')}
        className="fill-accent/10 stroke-accent"
        strokeWidth={1.5}
        strokeDasharray="5 4"
        strokeLinejoin="round"
      />
    </svg>
  )
}
