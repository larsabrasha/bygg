import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type Ref } from 'react'
import { Matrix4, Quaternion, Vector3, type BufferGeometry, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import { isHeadOn } from '../model/arrowDir'
import { HEAD_ON_OPACITY } from './PushPullHandle'
import type { Vec3 } from '../model/types'
import { useToolStore, type Axis } from '../store/toolStore'
import type { PickTarget } from '../tools/actions'
import { AXIS_COLORS, HOVER_SCALE, hoverColor } from './colors'
import { eyePosition, pixelScale } from './viewer'

/** Ritas ovanpå delen, som i Shapr3D: pilarna börjar mitt i den. */
const onTop = { depthTest: false, depthWrite: false, transparent: true } as const

/** En pil längs +Y; MoveGizmo vänder den mot sin axel varje bildruta. */
function AxisArrow({ axis, hot, ref }: { axis: Axis; hot: boolean; ref: Ref<Group> }) {
  const color = hot ? hoverColor(AXIS_COLORS[axis]) : AXIS_COLORS[axis]
  return (
    <group ref={ref} scale={hot ? HOVER_SCALE : 1}>
      <mesh position={[0, 38, 0]} renderOrder={10}>
        <cylinderGeometry args={[2.5, 2.5, 52]} />
        <meshBasicMaterial color={color} {...onTop} />
      </mesh>
      <mesh position={[0, 74, 0]} renderOrder={10}>
        <coneGeometry args={[9, 20, 20]} />
        <meshBasicMaterial color={color} {...onTop} />
      </mesh>
      {/* Osynlig, tjockare träffyta för fingret. */}
      <mesh position={[0, 50, 0]} visible={false} userData={{ pick: { kind: 'axis', axis } }}>
        <cylinderGeometry args={[16, 16, 80]} />
      </mesh>
    </group>
  )
}

const E = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)] as const
const AXIS_DIRS: readonly Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]
const UP = E[1]
// Återanvänds varje bildruta.
const TO_CAMERA = new Vector3()
const EYE = new Vector3()
const DIR = new Vector3()
/** Bågens radie i px: mellan pilarnas skaft och spetsar. */
const ARC_RADIUS = 58
/**
 * Bågen lämnar 22° fritt vid varje pil. Pilens träffyta är 16 px bred åt var
 * sida, 16° vid bågens radie; med mindre luft låg bågens ändar inne i den och
 * togs för pilen, eller tvärtom.
 */
const ARC_GAP = (22 * Math.PI) / 180

/**
 * Båge i planet vinkelrätt mot axeln, mellan de två andra pilarna. Drar man i
 * den vrids delen runt axeln. En torus ligger i XY-planet och börjar vid +X;
 * vridningen lägger den från nästa axel mot den därpå, som vridplanet i actions.ts.
 */
function RotateArc({ axis, hot }: { axis: Axis; hot: boolean }) {
  const quaternion = useMemo(
    () =>
      new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(E[(axis + 1) % 3]!, E[(axis + 2) % 3]!, E[axis])),
    [axis],
  )
  const arc = Math.PI / 2 - 2 * ARC_GAP
  return (
    <group quaternion={quaternion}>
      <group rotation={[0, 0, ARC_GAP]}>
        <mesh renderOrder={10}>
          {/* Under pekaren: tjockare och ljusare. Radien är densamma, så att bågen inte når pilarna. */}
          <torusGeometry args={[ARC_RADIUS, hot ? 4.5 : 2.5, 8, 32, arc]} />
          <meshBasicMaterial color={hot ? hoverColor(AXIS_COLORS[axis]) : AXIS_COLORS[axis]} {...onTop} />
        </mesh>
        <mesh visible={false} userData={{ pick: { kind: 'rotate', axis } }}>
          <torusGeometry args={[ARC_RADIUS, 12, 8, 32, arc]} />
        </mesh>
      </group>
    </group>
  )
}

/**
 * Tre pilar längs X, Y och Z på den valda delen i Flytta-läget, och en båge
 * runt varje axel. Pilen flyttar delen längs axeln, bågen vrider den runt
 * axeln. Ritas i pixlar, som PushPullHandle. Pilarna pekar alltid längs sin
 * axel; en som pekar nästan rakt mot kameran blir blek och går inte att dra i
 * (isHeadOn), som pilen på det valda.
 */
export function MoveGizmo({ center }: { center: Vec3 }) {
  const ref = useRef<Group>(null)
  const hover = useToolStore((s) => s.hoverHandle)
  const hotAxis = hover?.kind === 'axis' ? hover.axis : null
  const hotArc = hover?.kind === 'rotate' ? hover.axis : null
  const arrows = useRef<(Group | null)[]>([null, null, null])

  useFrame((state) => {
    const g = ref.current
    if (!g) return
    const eye = eyePosition(state, EYE)
    const distance = eye.distanceTo(g.position)
    g.scale.setScalar(pixelScale(state, distance))

    const toCamera = TO_CAMERA.subVectors(eye, g.position).divideScalar(distance).toArray() as Vec3
    // I VR pekar man med handen, inte med blicken: om ett drag går avgör strålen (se move i actions).
    const vr = state.gl.xr.isPresenting
    arrows.current.forEach((arrow, axis) => {
      if (!arrow) return
      const dir = AXIS_DIRS[axis]!
      const headOn = !vr && isHeadOn(dir, toCamera)
      arrow.quaternion.setFromUnitVectors(UP, DIR.fromArray(dir))
      for (const o of arrow.children) {
        const m = o as Mesh<BufferGeometry, MeshBasicMaterial>
        if (o.visible) m.material.opacity = headOn ? HEAD_ON_OPACITY : 1
        else o.userData.pick = { kind: 'axis', axis: axis as Axis, headOn } satisfies PickTarget
      }
    })
  })

  return (
    <group ref={ref} position={center} userData={{ noThumb: true }}>
      <mesh renderOrder={10}>
        <sphereGeometry args={[6, 16, 12]} />
        <meshBasicMaterial color="#ffffff" {...onTop} />
      </mesh>
      {([0, 1, 2] as const).map((axis) => (
        <AxisArrow
          key={axis}
          axis={axis}
          hot={hotAxis === axis}
          ref={(a) => {
            arrows.current[axis] = a
          }}
        />
      ))}
      <RotateArc axis={0} hot={hotArc === 0} />
      <RotateArc axis={1} hot={hotArc === 1} />
      <RotateArc axis={2} hot={hotArc === 2} />
    </group>
  )
}
