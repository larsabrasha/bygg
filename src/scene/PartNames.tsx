import { Html } from '@react-three/drei'
import { explodedCenter } from '../model/explode'
import type { Body, Vec3 } from '../model/types'

/** Delarnas namn mitt på dem i sprängskissen, så att man ser vad som är vad. */
export function PartNames({ bodies, offsets }: { bodies: readonly Body[]; offsets: ReadonlyMap<string, Vec3> }) {
  return (
    <>
      {bodies
        .filter((b) => !b.tool)
        .map((b) => (
          // Lågt z-index: under måttrutan och panelerna, som ligger ovanpå 3D-vyn.
          <Html
            key={b.id}
            position={explodedCenter(b, offsets)}
            center
            zIndexRange={[5, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <span className="block rounded-md bg-panel/90 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-ink shadow-sm">
              {b.name}
            </span>
          </Html>
        ))}
    </>
  )
}
