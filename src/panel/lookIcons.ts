import { createLucideIcon, type LucideIconNode } from 'lucide-react'

/**
 * Ikonerna för utseendena (Trådmodell, Skuggad, Realistisk): samma kub, ritad snett så att
 * de bakre kanterna får plats, som i SketchUps stilar och Blenders skuggningslägen. Trådmodellen
 * har bara kanter, med de dolda streckade; den skuggade har ytor i tre toner; den realistiska
 * har dessutom fibrer, som trätexturen. Tonerna är genomskinliga, så de fungerar i båda temana.
 */

const front = 'M3 8h13v13H3z'
const top = 'M3 8l5-5h13l-5 5z'
const right = 'M16 8l5-5v13l-5 5z'
const path = (key: string, d: string, attrs: Record<string, string> = {}): LucideIconNode => [
  'path',
  { d, key, ...attrs },
]
const edges = [path('edge-front', front), path('edge-top', 'M3 8l5-5h13l-5 5'), path('edge-right', 'M21 3v13l-5 5')]
const face = (key: string, d: string, opacity: number) =>
  path(key, d, { fill: 'currentColor', fillOpacity: String(opacity), stroke: 'none' })
const faces = [face('face-top', top, 0.12), face('face-front', front, 0.3), face('face-right', right, 0.55)]

export const WireframeCube = createLucideIcon('wireframe-cube', [
  ...edges,
  path('hidden', 'M8 3v13h13M8 16l-5 5', { strokeDasharray: '2 2' }),
])

export const ShadedCube = createLucideIcon('shaded-cube', [...faces, ...edges])

export const RealisticCube = createLucideIcon('realistic-cube', [
  ...faces,
  path('grain-front', 'M5.5 12.5c2.5-1 5.5 1 8 0M5.5 16.5c2.5-1 5.5 1 8 0', { strokeWidth: '1' }),
  path('grain-top', 'M7.5 6.5c2-.8 5.5.8 8.5 0', { strokeWidth: '1' }),
  ...edges,
])
