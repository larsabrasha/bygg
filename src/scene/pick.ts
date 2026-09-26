import type { Intersection, Object3D, Raycaster, Scene } from 'three'
import { circleFace, faceOnBox, type Box } from '../model/geometry'
import { FACES, type Face, type Vec3 } from '../model/types'
import { useToolStore } from '../store/toolStore'
import type { Hit, PickTarget, Ray } from '../tools/actions'
import { pickable } from '../tools/gestures'
import { pickScore } from '../tools/pickPriority'

/**
 * Träffar mot objekt med userData.pick, gemensamt för pekaren (ToolController)
 * och handkontrollerna i VR (VrRig).
 */

/** Pilen på det valda, flyttpilarna och bågarna: ritas ovanpå allt och vinner över delar (se pickScore). */
export const ON_TOP = new Set<string>(['handle', 'axis', 'rotate'])

export function pickTargets(scene: Scene): Object3D[] {
  // Nya objekt har ingen giltig matrixWorld förrän nästa bildruta ritats,
  // och med frameloop="demand" kan det dröja. Räkna om före raycast.
  scene.updateMatrixWorld()
  // Medan man väljer verktyg för Skär ut / Lägg till räknas inte värden: verktyget
  // ligger ofta inuti den (ett tapphål), och trycket ska nå det.
  const skip = useToolStore.getState().combining?.host
  const targets: Object3D[] = []
  scene.traverse((o) => {
    if (o.userData.pick && pickable(o.userData.pick, skip)) targets.push(o)
  })
  return targets
}

/** Den träff längs raycasterns stråle som vinner (pickScore). */
export function closestObject(raycaster: Raycaster, targets: Object3D[]): Intersection | null {
  let best: { hit: Intersection; score: number } | null = null
  for (const hit of raycaster.intersectObjects(targets, false)) {
    const score = pickScore(hit.object.userData.pick, hit.distance)
    if (!best || score < best.score) best = { hit, score }
  }
  return best?.hit ?? null
}

export function toHit(hit: Intersection): Hit {
  const p = hit.object.userData.pick as
    | { kind: 'body' | 'sketch'; id: string; round?: boolean; box?: Box }
    | Extract<PickTarget, { kind: 'handle' | 'axis' | 'rotate' }>
  // En del med verktyg: sidan räknas ur punkt och normal i formens koordinater, och
  // saknas inne i ett hål. En cylinders sida ur normalen, en lådas ur materialet.
  const face = (): Face | undefined => {
    if ('box' in p && p.box && hit.face) {
      const local = hit.object.worldToLocal(hit.point.clone()).toArray() as Vec3
      return faceOnBox(p.box, local, hit.face.normal.toArray() as Vec3)
    }
    return 'round' in p && p.round && hit.face
      ? circleFace(hit.face.normal.toArray() as Vec3)
      : FACES[hit.face?.materialIndex ?? 0]!
  }
  const target: PickTarget =
    p.kind === 'handle' || p.kind === 'axis' || p.kind === 'rotate'
      ? p
      : p.kind === 'body'
        ? { kind: 'body', id: p.id, face: face() }
        : { kind: 'sketch', id: p.id }
  return { point: hit.point.toArray() as Vec3, target }
}

/**
 * Golvet (y = 0) längs strålen, och hur långt bort. Bara när strålen börjar
 * ovanför golvet: underifrån syns det inte, och det skulle annars ta klicken
 * på delarnas undersidor.
 */
export function groundHit(ray: Ray): { hit: Hit; distance: number } | null {
  const t = ray.dir[1] !== 0 ? -ray.origin[1] / ray.dir[1] : -1
  if (!(t > 0 && ray.origin[1] > 0)) return null
  return {
    hit: {
      point: [ray.origin[0] + ray.dir[0] * t, 0, ray.origin[2] + ray.dir[2] * t],
      target: { kind: 'ground' },
    },
    distance: t,
  }
}
