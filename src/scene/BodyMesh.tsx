import { Edges } from '@react-three/drei'
import { memo, useEffect, useMemo } from 'react'
import { GreaterDepth, MeshStandardMaterial } from 'three'
import { bodyExtents } from '../model/geometry'
import { FACES, type Body, type Face } from '../model/types'
import { ACCENT, ACCENT_LIGHT, EDGE, materialColor } from './colors'
import { cylinderGeometry } from './cylinder'
import { frameQuaternion } from './frameTransform'

interface Props {
  body: Body
  selected?: boolean
  /** Länkad kopia av den valda delen. */
  sibling?: boolean
  highlightFace?: Face | null
  /** Förhandsvisning: halvgenomskinlig och går inte att träffa med pekaren, men kameran kan vrida runt den. */
  preview?: boolean
}

function BodyMeshImpl({ body, selected = false, sibling = false, highlightFace = null, preview = false }: Props) {
  const quaternion = useMemo(() => frameQuaternion(body.frame), [body.frame])
  const [w, h, d] = bodyExtents(body)
  const { x0, x1, y0, y1 } = body.profile
  const center: [number, number, number] = [(x0 + x1) / 2, (y0 + y1) / 2, (body.z0 + body.z1) / 2]

  const round = body.shape === 'circle'

  // En material per sida (i BoxGeometrys ordning) så att en sida kan markeras,
  // och så att raycast ger materialIndex = vilken sida som träffades.
  // En cylinder har tre: runda sidan, n+ och n− (CylinderGeometrys ordning).
  const color = materialColor(body.material)
  const materials = useMemo(() => {
    const parts: (readonly Face[])[] = round ? [['u+', 'u-', 'v+', 'v-'], ['n+'], ['n-']] : FACES.map((f) => [f])
    return parts.map((faces) => {
      const marked = !!highlightFace && faces.includes(highlightFace)
      const lit = selected || marked
      return new MeshStandardMaterial({
        color,
        emissive: lit ? ACCENT : '#000000',
        emissiveIntensity: marked ? 0.45 : lit ? 0.2 : 0,
        transparent: preview,
        opacity: preview ? 0.8 : 1,
      })
    })
  }, [round, color, selected, highlightFace, preview])
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  // Cylinderns axel längs n (three.js lägger den längs y). Ändarnas kanter blir cirklar;
  // den runda sidan har inga kanter, eftersom vinkeln mellan segmenten är liten.
  const cylinder = useMemo(() => (round ? cylinderGeometry(w, d) : null), [round, w, d])
  useEffect(() => () => cylinder?.dispose(), [cylinder])

  const edge = selected || preview ? ACCENT : sibling ? ACCENT_LIGHT : EDGE

  return (
    <group position={body.frame.origin} quaternion={quaternion}>
      <mesh
        position={center}
        material={materials}
        {...(cylinder && { geometry: cylinder })}
        userData={preview ? { pivot: true } : { pick: { kind: 'body', id: body.id, round } }}
      >
        {!cylinder && <boxGeometry args={[w, h, d]} />}
        <Edges color={edge} lineWidth={selected ? 2.5 : sibling ? 1.8 : 1} />
        {/*
          Den valda delens kanter där något ligger framför (en annan del eller
          delen själv): streckade och svaga, som dolda linjer på en ritning.
          GreaterDepth ritar bara bakom något. polygonOffset drar linjen mot
          kameran, så att ytorna vid en synlig kant inte räknas som framför.
        */}
        {selected && !preview && (
          <Edges
            color={ACCENT}
            lineWidth={1.5}
            dashed
            dashSize={12}
            gapSize={8}
            transparent
            opacity={0.6}
            depthFunc={GreaterDepth}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-4}
            polygonOffsetUnits={-4}
            renderOrder={2}
          />
        )}
      </mesh>
    </group>
  )
}

/** Samma del om allt som ritas är detsamma. Form och läge jämförs som referenser; de byts bara när de ändras. */
const sameBody = (a: Body, b: Body) =>
  a === b ||
  (a.id === b.id &&
    a.frame === b.frame &&
    a.profile === b.profile &&
    a.z0 === b.z0 &&
    a.z1 === b.z1 &&
    a.shape === b.shape &&
    a.material === b.material)

/**
 * Under push/pull och flytt skapas nya Body-objekt för alla delar vid varje
 * rörelse (förhandsdokumentet), fast bara en ändras. Utan memo ritades alla
 * om i React varje gång, vilket märks på iPad.
 */
export const BodyMesh = memo(
  BodyMeshImpl,
  (a, b) =>
    sameBody(a.body, b.body) &&
    a.selected === b.selected &&
    a.sibling === b.sibling &&
    a.highlightFace === b.highlightFace &&
    a.preview === b.preview,
)
