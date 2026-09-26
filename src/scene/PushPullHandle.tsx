import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import { isHeadOn } from '../model/arrowDir'
import type { Vec3 } from '../model/types'
import type { PickTarget } from '../tools/actions'
import { useToolStore } from '../store/toolStore'
import { ACCENT, HOVER_SCALE, hoverColor } from './colors'
import { setArrowOnScreen } from './dimensionLabels'
import { eyePosition, pixelScale } from './viewer'

const UP = new Vector3(0, 1, 0)
// Återanvänds varje bildruta.
const TO_CAMERA = new Vector3()
const EYE = new Vector3()
const DIR = new Vector3()
const BASE = new Vector3()
const TIP = new Vector3()
/** Spetsen och konens radie, i px (se meshen nedan). */
const TIP_PX = 66
const CONE_RADIUS = 10

/** Ritas ovanpå allt, som flyttpilarna: annars skymmer en del framför (t.ex. en hylla) pilen. */
const onTop = { color: ACCENT, depthTest: false, depthWrite: false, transparent: true } as const
/** Hur synlig en pil som pekar rakt mot kameran är (den går inte att dra i då, se isHeadOn). */
export const HEAD_ON_OPACITY = 0.35

/**
 * Pilen på vald yta eller skiss. Drar man i den blir det push/pull.
 * Ritas i pixlar (1 enhet = 1 px), så att den är lika stor oavsett avstånd.
 * Den pekar alltid åt det håll ytan går, som i Shapr3D. Vetter ytan nästan
 * rakt mot kameran blir den kort och blek och går inte att dra i (isHeadOn):
 * man vrider vyn lite eller skriver måttet.
 * En osynlig, tjockare cylinder gör den lätt att träffa med fingret, också
 * när en annan del ligger framför (se ON_TOP i ToolController).
 */
export function PushPullHandle({ anchor, normal }: { anchor: Vec3; normal: Vec3 }) {
  const ref = useRef<Group>(null)
  // Under pekaren eller strålen: större och ljusare, så att man ser att den går att ta tag i.
  const hot = useToolStore((s) => s.hoverHandle?.kind === 'handle')
  const material = { ...onTop, color: hot ? hoverColor(ACCENT) : ACCENT }
  const hitRef = useRef<Mesh>(null)
  useEffect(() => () => setArrowOnScreen(null), [])

  useFrame((state) => {
    const { camera, size, gl } = state
    const g = ref.current
    if (!g) return
    const eye = eyePosition(state, EYE)
    const distance = eye.distanceTo(g.position)
    g.scale.setScalar(pixelScale(state, distance) * (hot ? HOVER_SCALE : 1))

    // I VR pekar man med handen, inte med blicken: om ett drag går avgör strålen (se move i actions).
    const toCamera = TO_CAMERA.subVectors(eye, g.position).divideScalar(distance)
    const headOn = !gl.xr.isPresenting && isHeadOn(normal, toCamera.toArray() as Vec3)
    g.quaternion.setFromUnitVectors(UP, DIR.fromArray(normal))
    g.traverse((o) => {
      const m = (o as Mesh).material as MeshBasicMaterial | undefined
      if (m && o.visible) m.opacity = headOn ? HEAD_ON_OPACITY : 1
    })
    // Var pilen syns på skärmen, från foten till spetsen, för måttetiketterna.
    const toPx = (p: Vector3): [number, number] => {
      p.project(camera)
      return [((p.x + 1) * size.width) / 2, ((1 - p.y) * size.height) / 2]
    }
    const tip = TIP.copy(g.position).addScaledVector(DIR, TIP_PX * g.scale.x)
    setArrowOnScreen({ a: toPx(BASE.copy(g.position)), b: toPx(tip), r: CONE_RADIUS })
    if (hitRef.current) hitRef.current.userData.pick = { kind: 'handle', headOn } satisfies PickTarget
  })

  return (
    <group ref={ref} position={anchor} userData={{ noThumb: true }}>
      <mesh position={[0, 26, 0]} renderOrder={10}>
        <cylinderGeometry args={[2.5, 2.5, 44]} />
        <meshBasicMaterial {...material} />
      </mesh>
      <mesh position={[0, 56, 0]} renderOrder={10}>
        <coneGeometry args={[10, 20, 20]} />
        <meshBasicMaterial {...material} />
      </mesh>
      <mesh ref={hitRef} position={[0, 36, 0]} visible={false} userData={{ pick: { kind: 'handle' } }}>
        <cylinderGeometry args={[20, 20, 64]} />
      </mesh>
    </group>
  )
}
