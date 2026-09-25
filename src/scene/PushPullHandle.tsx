import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3, type Group, type Mesh, type PerspectiveCamera } from 'three'
import { arrowDir } from '../model/arrowDir'
import type { Vec3 } from '../model/types'
import type { PickTarget } from '../tools/actions'
import { ACCENT } from './colors'

const UP = new Vector3(0, 1, 0)
// Återanvänds varje bildruta.
const TO_CAMERA = new Vector3()
const SCREEN_UP = new Vector3()
const DIR = new Vector3()

/** Ritas ovanpå allt, som flyttpilarna: annars skymmer en del framför (t.ex. en hylla) pilen. */
const onTop = { color: ACCENT, depthTest: false, depthWrite: false, transparent: true } as const

/**
 * Pilen på vald yta eller skiss. Drar man i den blir det push/pull.
 * Ritas i pixlar (1 enhet = 1 px), så att den är lika stor oavsett avstånd.
 * Vetter ytan rakt mot kameran lutas den mot skärmens överkant (arrowDir),
 * annars syns den bara som en prick.
 * En osynlig, tjockare cylinder gör den lätt att träffa med fingret, också
 * när en annan del ligger framför (se ON_TOP i ToolController).
 */
export function PushPullHandle({ anchor, normal }: { anchor: Vec3; normal: Vec3 }) {
  const ref = useRef<Group>(null)
  const hitRef = useRef<Mesh>(null)

  useFrame(({ camera, size }) => {
    const g = ref.current
    if (!g) return
    const distance = camera.position.distanceTo(g.position)
    const fov = ((camera as PerspectiveCamera).fov * Math.PI) / 180
    g.scale.setScalar((2 * distance * Math.tan(fov / 2)) / size.height)

    const toCamera = TO_CAMERA.subVectors(camera.position, g.position).divideScalar(distance)
    const up = SCREEN_UP.setFromMatrixColumn(camera.matrixWorld, 1)
    const dir = arrowDir(normal, toCamera.toArray() as Vec3, up.toArray() as Vec3)
    g.quaternion.setFromUnitVectors(UP, DIR.fromArray(dir))
    // Träffen bär med sig riktningen, så att draget börjar där man tog tag längs den lutade pilen.
    if (hitRef.current) hitRef.current.userData.pick = { kind: 'handle', dir } satisfies PickTarget
  })

  return (
    <group ref={ref} position={anchor} userData={{ noThumb: true }}>
      <mesh position={[0, 26, 0]} renderOrder={10}>
        <cylinderGeometry args={[2.5, 2.5, 44]} />
        <meshBasicMaterial {...onTop} />
      </mesh>
      <mesh position={[0, 56, 0]} renderOrder={10}>
        <coneGeometry args={[10, 20, 20]} />
        <meshBasicMaterial {...onTop} />
      </mesh>
      <mesh ref={hitRef} position={[0, 36, 0]} visible={false} userData={{ pick: { kind: 'handle' } }}>
        <cylinderGeometry args={[20, 20, 64]} />
      </mesh>
    </group>
  )
}
