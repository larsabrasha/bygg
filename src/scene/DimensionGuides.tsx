import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Vector3 } from 'three'
import { dimensionEdges, type DimensionEdge } from '../model/dimensions'
import { bodyCenter } from '../model/geometry'
import type { Body, Vec3 } from '../model/types'
import { add, scale } from '../model/vec'
import { labelElements, labelSizes, setDimensionWake } from './dimensionLabels'

/** Ungefärlig halv bredd och höjd på en etikett och luften mot kanten, i px. */
const HALF_W = 30
const HALF_H = 14
const GAP = 6

const v = new Vector3()

/** Var en etikett sitter: kantens mitt på skärmen m, riktningen ut n och avståndet d, i px. */
interface Placement {
  m: [number, number]
  n: [number, number]
  d: number
}

/**
 * Etikettens läge på skärmen: kantens mitt, flyttad ut från delen vinkelrätt
 * mot kanten så som den syns, bort från delens mitt, så långt att etiketten
 * inte täcker kanten. Null om kanten ligger bakom kameran.
 */
function labelPlacement(
  edge: DimensionEdge,
  center: Vec3,
  project: (p: Vec3) => [number, number] | null,
): Placement | null {
  const m = project(scale(add(edge.from, edge.to), 0.5))
  const a = project(edge.from)
  const b = project(edge.to)
  const c = project(center)
  if (!m || !a || !b || !c) return null
  // Normalen till kanten på skärmen. Syns kanten som en punkt (man tittar längs den) används riktningen bort från mitten.
  let [nx, ny] = [-(b[1] - a[1]), b[0] - a[0]]
  if (Math.hypot(nx, ny) < 1) [nx, ny] = [m[0] - c[0], m[1] - c[1]]
  if (nx * (m[0] - c[0]) + ny * (m[1] - c[1]) < 0) [nx, ny] = [-nx, -ny]
  const len = Math.hypot(nx, ny)
  if (len < 1e-9) return { m, n: [0, 0], d: 0 }
  ;[nx, ny] = [nx / len, ny / len]
  return { m, n: [nx, ny], d: HALF_W * Math.abs(nx) + HALF_H * Math.abs(ny) + GAP }
}

const at = ({ m, n, d }: Placement): [number, number] => [m[0] + n[0] * d, m[1] + n[1] * d]

/** Hur långt en etikett flyttas ut i taget när den krockar med en annan, och som mest hur många gånger. */
const NUDGE = 8
/** Minsta avstånd från vyns kant, i px. */
const EDGE_MARGIN = 8

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), Math.max(lo, hi))
const MAX_NUDGES = 12

/** Om två etiketter (mitt och storlek i px) överlappar, med lite luft. */
function overlaps(a: [number, number], sa: [number, number], b: [number, number], sb: [number, number]) {
  return Math.abs(a[0] - b[0]) * 2 < sa[0] + sb[0] + 4 && Math.abs(a[1] - b[1]) * 2 < sa[1] + sb[1] + 4
}

/**
 * Placerar måttetiketterna (panel/DimensionLabels) på skärmen, vid de kanter
 * som den valda delens mått sitter på (närmast kameran). Kanterna själva syns
 * redan i markeringen, också där något skymmer dem (BodyMesh).
 */
export function DimensionGuides({ body }: { body: Body }) {
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)

  // Etiketterna ritas i en annan del av sidan; när de dyker upp behövs en bildruta som placerar dem.
  useEffect(() => {
    setDimensionWake(invalidate)
    invalidate()
    return () => setDimensionWake(null)
  }, [invalidate])

  useFrame(({ size: view }) => {
    const current = dimensionEdges(body, camera.position.toArray() as Vec3)
    const project = (p: Vec3): [number, number] | null => {
      v.set(...p).project(camera)
      return v.z > 1 ? null : [((v.x + 1) * view.width) / 2, ((1 - v.y) * view.height) / 2]
    }
    const center = bodyCenter(body)
    // Etiketterna placeras en i taget; krockar en med en som redan står flyttas den längre ut.
    const placed: { pos: [number, number]; size: [number, number] }[] = []
    for (const edge of current) {
      const el = labelElements.get(edge.axis)
      if (!el) continue
      const p = labelPlacement(edge, center, project)
      el.style.visibility = p ? 'visible' : 'hidden'
      if (!p) continue
      const size = labelSizes.get(edge.axis) ?? [2 * HALF_W, 2 * HALF_H]
      let pos = at(p)
      for (let i = 0; i < MAX_NUDGES && placed.some((q) => overlaps(pos, size, q.pos, q.size)); i++) {
        p.d += NUDGE
        pos = at(p)
      }
      // Inom vyn, så att en etikett vid kanten av skärmen går att trycka på.
      pos = [
        clamp(pos[0], size[0] / 2 + EDGE_MARGIN, view.width - size[0] / 2 - EDGE_MARGIN),
        clamp(pos[1], size[1] / 2 + EDGE_MARGIN, view.height - size[1] / 2 - EDGE_MARGIN),
      ]
      placed.push({ pos, size })
      el.style.transform = `translate(${pos[0]}px, ${pos[1]}px) translate(-50%, -50%)`
    }
  })

  return null
}
