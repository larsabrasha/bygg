import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Matrix4, Quaternion, Vector3, type Group, type PerspectiveCamera } from 'three'
import type { Vec3 } from '../model/types'
import type { Axis } from '../store/toolStore'
import { AXIS_COLORS } from './colors'

/** Rotation som vänder en cylinder (längs +Y) mot +X, +Y och +Z. */
const ROTATIONS: Record<Axis, [number, number, number]> = {
  0: [0, 0, -Math.PI / 2],
  1: [0, 0, 0],
  2: [Math.PI / 2, 0, 0],
}

/** Ritas ovanpå delen, som i Shapr3D: pilarna börjar mitt i den. */
const onTop = { depthTest: false, depthWrite: false, transparent: true } as const

function AxisArrow({ axis }: { axis: Axis }) {
  const color = AXIS_COLORS[axis]
  return (
    <group rotation={ROTATIONS[axis]}>
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
/** Bågens radie i px: mellan pilarnas skaft och spetsar. */
const ARC_RADIUS = 58
/** Bågen lämnar 15° fritt vid varje pil, så att de inte krockar. */
const ARC_GAP = Math.PI / 12

/**
 * Båge i planet vinkelrätt mot axeln, mellan de två andra pilarna. Drar man i
 * den vrids delen runt axeln. En torus ligger i XY-planet och börjar vid +X;
 * vridningen lägger den från nästa axel mot den därpå, som vridplanet i actions.ts.
 */
function RotateArc({ axis }: { axis: Axis }) {
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
          <torusGeometry args={[ARC_RADIUS, 2.5, 8, 32, arc]} />
          <meshBasicMaterial color={AXIS_COLORS[axis]} {...onTop} />
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
 * axeln. Ritas i pixlar, som PushPullHandle.
 */
export function MoveGizmo({ center }: { center: Vec3 }) {
  const ref = useRef<Group>(null)

  useFrame(({ camera, size }) => {
    const g = ref.current
    if (!g) return
    const fov = ((camera as PerspectiveCamera).fov * Math.PI) / 180
    g.scale.setScalar((2 * camera.position.distanceTo(g.position) * Math.tan(fov / 2)) / size.height)
  })

  return (
    <group ref={ref} position={center} userData={{ noThumb: true }}>
      <mesh renderOrder={10}>
        <sphereGeometry args={[6, 16, 12]} />
        <meshBasicMaterial color="#ffffff" {...onTop} />
      </mesh>
      <AxisArrow axis={0} />
      <AxisArrow axis={1} />
      <AxisArrow axis={2} />
      <RotateArc axis={0} />
      <RotateArc axis={1} />
      <RotateArc axis={2} />
    </group>
  )
}
