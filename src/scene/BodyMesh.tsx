import { Edges } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  GreaterDepth,
  MeshStandardMaterial,
  Vector3,
  type LineSegments,
} from 'three'
import { bodyExtents, type Box } from '../model/geometry'
import { FACES, type Body, type Face, type Vec3 } from '../model/types'
import { add } from '../model/vec'
import { ACCENT, ACCENT_LIGHT, EDGE, materialColor } from './colors'
import { DRAG_SEGMENTS, SEGMENTS } from '../model/solid'
import { solidGeometry, useManifold } from './csg'
import { cylinderGeometry } from './cylinder'
import { frameQuaternion } from './frameTransform'
import { grainUvs, hash01 } from './grainUv'
import { tangentPoints } from './silhouette'
import { useColorScheme } from './useColorScheme'
import { woodTexture } from './woodTexture'
import type { Look } from '../store/viewStore'

/** Formens låda, för att räkna ut vilken sida en träff på resultatet ligger på (faceOnBox). */
/** Hur synlig en del är när en annan är isolerad. */
const FADED_OPACITY = 0.18

const boxOf = (b: Body): Box => ({ profile: b.profile, ...(b.shape && { shape: b.shape }), z0: b.z0, z1: b.z1 })

interface Props {
  body: Body
  selected?: boolean
  /** Länkad kopia av den valda delen. */
  sibling?: boolean
  highlightFace?: Face | null
  /** Förhandsvisning: halvgenomskinlig och går inte att träffa med pekaren, men kameran kan vrida runt den. */
  preview?: boolean
  /** Ett verktyg (läggs till eller skärs ut): genomskinligt med streckade kanter. */
  ghost?: boolean
  /** Hur långt delen flyttats i sprängskissen, i världen. */
  offset?: Vec3
  /**
   * En annan del är isolerad: den här syns genomskinlig och går inte att trycka
   * på, men man ser var den är och kan snäppa mot den (snäppningen räknar med
   * alla delar). Kameran kan vrida runt den.
   */
  faded?: boolean
  /**
   * Utseendet: skuggat (som på ritningen), bara kanter, eller trä med ådring
   * längs fibern. Ytorna finns kvar i trådmodellen, osynliga, så att de går att trycka på.
   */
  look?: Look
}

/** Axeln längs fibern som index i delens koordinater (u, v, n = x, y, z). */
const AXIS_INDEX = { u: 0, v: 1, n: 2 } as const
/** Kanterna i trådmodellen i mörkt tema; EDGE syns inte mot den mörka bakgrunden. */
const WIRE_DARK = '#e6d8c2'

function BodyMeshImpl({
  body,
  selected = false,
  sibling = false,
  highlightFace = null,
  preview = false,
  ghost = false,
  offset,
  faded = false,
  look = 'shaded',
}: Props) {
  const scheme = useColorScheme()
  const quaternion = useMemo(() => frameQuaternion(body.frame), [body.frame])
  const [w, h, d] = bodyExtents(body)
  const { x0, x1, y0, y1 } = body.profile
  const center: [number, number, number] = [(x0 + x1) / 2, (y0 + y1) / 2, (body.z0 + body.z1) / 2]

  const round = body.shape === 'circle'
  // Med verktyg ritas resultatet av manifold-3d, i formens koordinater (medan den laddas: bara formen).
  const manifold = useManifold(!!body.tools)
  // Medan delen dras (förhandsvisning) räknas runda hål och tappar med färre segment: det går
  // flera gånger fortare. När man släpper ritas den med alla.
  const segments = preview ? DRAG_SEGMENTS : SEGMENTS
  const solid = useMemo(
    () => (manifold && body.tools ? solidGeometry(manifold, body, body.tools, segments) : null),
    // body självt byts vid varje ändring i dokumentet; det som ritas är form och verktyg.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manifold, body.profile, body.shape, body.z0, body.z1, body.tools, segments],
  )

  // En material per sida (i BoxGeometrys ordning) så att en sida kan markeras,
  // och så att raycast ger materialIndex = vilken sida som träffades.
  // En cylinder har tre: runda sidan, n+ och n− (CylinderGeometrys ordning).
  const color = materialColor(body.material)
  const wire = look === 'wireframe'
  const real = look === 'realistic' && !ghost
  const materials = useMemo(() => {
    // Resultatet med verktyg är en enda yta; där markeras hela delen.
    const parts: (readonly Face[])[] = solid
      ? [FACES]
      : round
        ? [['u+', 'u-', 'v+', 'v-'], ['n+'], ['n-']]
        : FACES.map((f) => [f])
    return parts.map((faces) => {
      const marked = !solid && !!highlightFace && faces.includes(highlightFace)
      const lit = selected || marked
      if (wire && !ghost) {
        // Trådmodell: ytan syns bara som en svag fyllning när den är markerad eller vald.
        return new MeshStandardMaterial({
          color: ACCENT,
          transparent: true,
          opacity: marked ? 0.25 : selected ? 0.08 : 0,
          depthWrite: false,
        })
      }
      return new MeshStandardMaterial({
        color: ghost ? ACCENT : real ? '#ffffff' : color,
        ...(real && { map: woodTexture(body.material), roughness: 0.62, metalness: 0 }),
        emissive: lit ? ACCENT : '#000000',
        emissiveIntensity: marked ? 0.45 : lit ? 0.2 : 0,
        transparent: preview || ghost || faded,
        opacity: ghost ? (selected ? 0.3 : 0.15) : faded ? FADED_OPACITY : preview ? 0.8 : 1,
        // Ett spöke skymmer inte det bakom sig, och syns genom det framför (en tapp inne i ett ben).
        // En genomskinlig del (isolerat) skymmer inte heller den isolerade.
        depthWrite: !ghost && !faded,
        depthTest: !ghost,
      })
    })
  }, [solid, round, color, selected, highlightFace, preview, ghost, faded, wire, real, body.material])
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  // Cylinderns axel längs n (three.js lägger den längs y). Ändarnas kanter blir cirklar;
  // den runda sidan har inga kanter, eftersom vinkeln mellan segmenten är liten.
  // Geometrin ges alltid som prop. Växlade den mellan prop och <boxGeometry> fick meshen en
  // tom geometri under bytet (t.ex. när ett verktyg lossas), och Edges kraschade på den.
  const own = useMemo(() => (round ? cylinderGeometry(w, d) : new BoxGeometry(w, h, d)), [round, w, h, d])
  useEffect(() => () => own.dispose(), [own])

  // Trä: texturkoordinater längs fibern, med ett eget mönster per del (se grainUv).
  // I render, inte i en effekt: de ska finnas redan när delen ritas första gången.
  const geometry = solid ?? own
  const grain = AXIS_INDEX[body.grainAxis]
  useMemo(() => {
    if (!real) return
    const pos = geometry.getAttribute('position')
    const normal = geometry.getAttribute('normal')
    if (!pos || !normal) return
    const uv = grainUvs(pos.array, normal.array, grain, [hash01(body.id), hash01(body.id, 1)])
    geometry.setAttribute('uv', new BufferAttribute(uv, 2))
  }, [real, geometry, grain, body.id])

  const edge = selected || preview ? ACCENT : sibling ? ACCENT_LIGHT : wire && scheme === 'dark' ? WIRE_DARK : EDGE
  // Trä ritas utan kanter, som ett foto; det valda och kopiorna av det har dem ändå.
  const plainReal = real && !selected && !sibling && !preview && !faded

  return (
    <group position={offset ? add(body.frame.origin, offset) : body.frame.origin} quaternion={quaternion}>
      {/* En cylinders mantel har inga kanter; i trådmodellen syns den genom konturlinjerna. */}
      {round && wire && !ghost && (
        <Silhouette center={[(x0 + x1) / 2, (y0 + y1) / 2]} r={(x1 - x0) / 2} z0={body.z0} z1={body.z1} color={edge} />
      )}
      <mesh
        // Resultatet med verktyg är redan i formens koordinater; lådan och cylindern ritas kring sin mitt.
        position={solid ? [0, 0, 0] : center}
        // En lista med material kräver grupper i geometrin; resultatet med verktyg har inga och ett material.
        material={solid ? materials[0] : materials}
        geometry={geometry}
        // Skuggor bara i det realistiska utseendet (se RealisticLight).
        castShadow={real && !faded}
        receiveShadow={real}
        userData={
          preview || faded
            ? { pivot: true }
            : { pick: { kind: 'body', id: body.id, round, tool: ghost, ...(solid && { box: boxOf(body) }) } }
        }
      >
        {ghost ? (
          <Edges
            color={ACCENT}
            lineWidth={selected ? 2 : 1.5}
            dashed
            dashSize={10}
            gapSize={6}
            depthTest={false}
            renderOrder={3}
          />
        ) : faded ? (
          <Edges color={edge} lineWidth={1} transparent opacity={FADED_OPACITY * 2} depthWrite={false} />
        ) : plainReal ? null : (
          <Edges color={edge} lineWidth={selected ? 2.5 : sibling ? 1.8 : 1} />
        )}
        {/*
          Den valda delens kanter där något ligger framför (en annan del eller
          delen själv): streckade och svaga, som dolda linjer på en ritning.
          GreaterDepth ritar bara bakom något. polygonOffset drar linjen mot
          kameran, så att ytorna vid en synlig kant inte räknas som framför.
        */}
        {selected && !preview && !ghost && !wire && (
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

const cameraLocal = new Vector3()

/**
 * Konturlinjerna på en cylinder (axeln längs n, i formens koordinater): två
 * linjer längs axeln där manteln vänder bort från kameran, som i en CAD-trådmodell.
 * Följer kameran; räknas om före varje bildruta.
 */
function Silhouette({
  center,
  r,
  z0,
  z1,
  color,
}: {
  center: [number, number]
  r: number
  z0: number
  z1: number
  color: string
}) {
  const ref = useRef<LineSegments>(null)
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(12), 3))
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(({ camera }) => {
    const line = ref.current
    if (!line) return
    const p = line.worldToLocal(cameraLocal.copy(camera.position))
    const points = tangentPoints(center, r, [p.x, p.y])
    line.visible = !!points
    if (!points) return
    const pos = geometry.getAttribute('position') as BufferAttribute
    points.forEach(([x, y], i) => {
      pos.setXYZ(i * 2, x, y, z0)
      pos.setXYZ(i * 2 + 1, x, y, z1)
    })
    pos.needsUpdate = true
    geometry.computeBoundingSphere()
  })

  return (
    <lineSegments ref={ref} geometry={geometry}>
      <lineBasicMaterial color={color} />
    </lineSegments>
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
    a.tools === b.tools &&
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
    a.preview === b.preview &&
    a.ghost === b.ghost &&
    a.offset?.join() === b.offset?.join() &&
    a.faded === b.faded &&
    a.look === b.look,
)
