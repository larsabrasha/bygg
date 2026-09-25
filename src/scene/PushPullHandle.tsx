import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Quaternion, Vector3, type Group, type PerspectiveCamera } from 'three'
import type { Vec3 } from '../model/types'
import { ACCENT } from './colors'

const UP = new Vector3(0, 1, 0)

/** Ritas ovanpå allt, som flyttpilarna: annars skymmer en del framför (t.ex. en hylla) pilen. */
const onTop = { color: ACCENT, depthTest: false, depthWrite: false, transparent: true } as const

/**
 * Pilen på vald yta eller skiss. Drar man i den blir det push/pull.
 * Ritas i pixlar (1 enhet = 1 px), så att den är lika stor oavsett avstånd.
 * En osynlig, tjockare cylinder gör den lätt att träffa med fingret, också
 * när en annan del ligger framför (se ON_TOP i ToolController).
 */
export function PushPullHandle({ anchor, normal }: { anchor: Vec3; normal: Vec3 }) {
  const ref = useRef<Group>(null)
  const quaternion = useMemo(() => new Quaternion().setFromUnitVectors(UP, new Vector3(...normal)), [normal])

  useFrame(({ camera, size }) => {
    const g = ref.current
    if (!g) return
    const fov = ((camera as PerspectiveCamera).fov * Math.PI) / 180
    const mmPerPx = (2 * camera.position.distanceTo(g.position) * Math.tan(fov / 2)) / size.height
    g.scale.setScalar(mmPerPx)
  })

  const pick = { pick: { kind: 'handle' } }
  return (
    <group ref={ref} position={anchor} quaternion={quaternion} userData={{ noThumb: true }}>
      <mesh position={[0, 26, 0]} renderOrder={10}>
        <cylinderGeometry args={[2.5, 2.5, 44]} />
        <meshBasicMaterial {...onTop} />
      </mesh>
      <mesh position={[0, 56, 0]} renderOrder={10}>
        <coneGeometry args={[10, 20, 20]} />
        <meshBasicMaterial {...onTop} />
      </mesh>
      <mesh position={[0, 36, 0]} visible={false} userData={pick}>
        <cylinderGeometry args={[20, 20, 64]} />
      </mesh>
    </group>
  )
}
