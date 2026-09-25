import { Line } from '@react-three/drei'
import { rulerResult } from '../model/ruler'
import { useToolStore } from '../store/toolStore'
import { ACCENT } from './colors'
import { SnapMarker } from './SnapMarker'

/**
 * Mät i 3D-vyn: punkterna man tryckt på, linjen som mäts och (med mus)
 * punkten under pekaren. Värdet står i måttrutan.
 */
export function RulerOverlay() {
  const ruler = useToolStore((s) => s.ruler)
  const hover = useToolStore((s) => s.rulerHover)
  const tool = useToolStore((s) => s.tool)
  if (tool !== 'measure') return null
  const [a, b] = ruler.length === 2 ? ruler : [ruler[0], hover]
  const result = a && b ? rulerResult(a, b) : null
  const done = ruler.length === 2
  return (
    <group userData={{ noThumb: true }}>
      {ruler.map((p, i) => (
        <SnapMarker key={i} position={p.point} onTarget={p.snap !== null} />
      ))}
      {hover && !done && <SnapMarker position={hover.point} onTarget={hover.snap !== null} />}
      {result && result.distance > 0 && (
        <Line
          points={[result.from, result.to]}
          color={ACCENT}
          lineWidth={done ? 2.5 : 1.5}
          dashed={!done}
          dashSize={20}
          gapSize={12}
          depthTest={false}
          renderOrder={3}
        />
      )}
    </group>
  )
}
