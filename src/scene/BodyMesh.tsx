import { Edges } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { MeshStandardMaterial } from 'three'
import { bodyExtents } from '../model/geometry'
import { FACES, type Body, type Face } from '../model/types'
import { ACCENT, EDGE, materialColor } from './colors'
import { frameQuaternion } from './frameTransform'

interface Props {
  body: Body
  selected?: boolean
  highlightFace?: Face | null
  /** Förhandsvisning: halvgenomskinlig och går inte att träffa med pekaren. */
  preview?: boolean
}

export function BodyMesh({ body, selected = false, highlightFace = null, preview = false }: Props) {
  const quaternion = useMemo(() => frameQuaternion(body.frame), [body.frame])
  const [w, h, d] = bodyExtents(body)
  const { x0, x1, y0, y1 } = body.profile
  const center: [number, number, number] = [(x0 + x1) / 2, (y0 + y1) / 2, (body.z0 + body.z1) / 2]

  // En material per sida (i BoxGeometrys ordning) så att en sida kan markeras,
  // och så att raycast ger materialIndex = vilken sida som träffades.
  const color = materialColor(body.material)
  const materials = useMemo(
    () =>
      FACES.map((face) => {
        const lit = selected || face === highlightFace
        return new MeshStandardMaterial({
          color,
          emissive: lit ? ACCENT : '#000000',
          emissiveIntensity: face === highlightFace ? 0.45 : lit ? 0.2 : 0,
          transparent: preview,
          opacity: preview ? 0.8 : 1,
        })
      }),
    [color, selected, highlightFace, preview],
  )
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  return (
    <group position={body.frame.origin} quaternion={quaternion}>
      <mesh
        position={center}
        material={materials}
        userData={preview ? {} : { pick: { kind: 'body', id: body.id } }}
      >
        <boxGeometry args={[w, h, d]} />
        <Edges color={selected || preview ? ACCENT : EDGE} lineWidth={selected ? 2.5 : 1} />
      </mesh>
    </group>
  )
}
