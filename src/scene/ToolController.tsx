import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Raycaster, Vector2, type Intersection, type Object3D } from 'three'
import { FACES, type Vec3 } from '../model/types'
import { cancel, commit, hoverAt, move, tap, type Hit, type PickTarget, type Ray } from '../tools/actions'
import { useToolStore } from '../store/toolStore'

type PointerKind = 'mouse' | 'pen' | 'touch'

/** Hur långt pekaren får röra sig och ändå räknas som ett tryck, i px. */
const TAP_SLOP: Record<PointerKind, number> = { mouse: 4, pen: 6, touch: 10 }
/**
 * Hur nära en del pekaren måste vara för att träffa den, i px. Gör tunna
 * delar (en 22 mm bräda är några px hög på avstånd) möjliga att träffa.
 */
const PICK_RADIUS: Record<PointerKind, number> = { mouse: 6, pen: 8, touch: 16 }
/** Snäpptolerans som andel av avståndet från kameran till träffpunkten (~15 px). */
const SNAP_FRACTION = 0.015

const kindOf = (e: PointerEvent): PointerKind =>
  e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse'

/**
 * Översätter pekarhändelser till verktygsanrop. Egen raycasting mot objekt med
 * userData.pick, plus golvplanet y = 0. R3F:s egna mesh-händelser används inte.
 */
export function ToolController() {
  const { camera, gl, scene } = useThree()
  const raycaster = useMemo(() => new Raycaster(), [])

  useEffect(() => {
    const el = gl.domElement
    const ndc = new Vector2()
    let down: { x: number; y: number; slop: number } | null = null
    let multiTouch = false
    const activePointers = new Set<number>()

    const castRay = (x: number, y: number): Ray => {
      const r = el.getBoundingClientRect()
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      return { origin: raycaster.ray.origin.toArray() as Vec3, dir: raycaster.ray.direction.toArray() as Vec3 }
    }
    const rayOf = (e: PointerEvent) => castRay(e.clientX, e.clientY)

    const pickTargets = (): Object3D[] => {
      // Nya objekt har ingen giltig matrixWorld förrän nästa bildruta ritats,
      // och med frameloop="demand" kan det dröja. Räkna om före raycast.
      scene.updateMatrixWorld()
      const targets: Object3D[] = []
      scene.traverse((o) => {
        if (o.userData.pick) targets.push(o)
      })
      return targets
    }

    /** Närmaste objekt längs den senast kastade strålen. Skisser får företräde framför ytan de ligger på. */
    const closestObject = (targets: Object3D[]): Intersection | null => {
      let best: { hit: Intersection; score: number } | null = null
      for (const hit of raycaster.intersectObjects(targets, false)) {
        const score = hit.distance - (hit.object.userData.pick.kind === 'sketch' ? 1 : 0)
        if (!best || score < best.score) best = { hit, score }
      }
      return best?.hit ?? null
    }

    const toHit = (hit: Intersection): Hit => {
      const p = hit.object.userData.pick as { kind: 'body' | 'sketch'; id: string }
      const target: PickTarget =
        p.kind === 'body'
          ? { kind: 'body', id: p.id, face: FACES[hit.face?.materialIndex ?? 0]! }
          : { kind: 'sketch', id: p.id }
      return { point: hit.point.toArray() as Vec3, target }
    }

    /**
     * Träff under pekaren. Missar strålen alla objekt provas en ring runt
     * pekaren (PICK_RADIUS); först därefter räknas golvet.
     */
    const pick = (x: number, y: number, kind: PointerKind): Hit | null => {
      const targets = pickTargets()
      const center = castRay(x, y)
      const direct = closestObject(targets)

      const groundT = center.dir[1] !== 0 ? -center.origin[1] / center.dir[1] : -1
      const ground: Hit | null =
        groundT > 0
          ? {
              point: [center.origin[0] + center.dir[0] * groundT, 0, center.origin[2] + center.dir[2] * groundT],
              target: { kind: 'ground' },
            }
          : null

      if (direct) return ground && groundT < direct.distance ? ground : toHit(direct)

      const r = PICK_RADIUS[kind]
      for (const radius of [r / 2, r]) {
        let best: Intersection | null = null
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2
          castRay(x + Math.cos(a) * radius, y + Math.sin(a) * radius)
          const h = closestObject(targets)
          if (h && (!best || h.distance < best.distance)) best = h
        }
        if (best) return toHit(best)
      }
      return ground
    }

    const tolFor = (point: Vec3) =>
      camera.position.distanceTo({ x: point[0], y: point[1], z: point[2] }) * SNAP_FRACTION
    const tolForRay = () => camera.position.length() * SNAP_FRACTION

    const onDown = (e: PointerEvent) => {
      activePointers.add(e.pointerId)
      if (activePointers.size > 1) multiTouch = true
      if (!e.isPrimary) return
      down = { x: e.clientX, y: e.clientY, slop: TAP_SLOP[kindOf(e)] }
      if (useToolStore.getState().op) move(rayOf(e), tolForRay())
    }

    const onMove = (e: PointerEvent) => {
      if (!e.isPrimary || multiTouch) return
      const { op, tool, hover, setHover } = useToolStore.getState()
      if (op) {
        move(rayOf(e), tolForRay())
        return
      }
      // Hover bara med mus; touch har ingen hover.
      if (e.pointerType !== 'mouse' || e.buttons !== 0 || tool === 'select') return
      const hit = pick(e.clientX, e.clientY, 'mouse')
      if (tool === 'rect') {
        hoverAt(hit, hit ? tolFor(hit.point) : 0)
        return
      }
      const t = hit?.target
      const next = t && t.kind !== 'ground' && (tool === 'pushpull' || t.kind === 'body') ? t : null
      if (JSON.stringify(next) !== JSON.stringify(hover)) setHover(next)
    }

    const onUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId)
      const wasMulti = multiTouch
      if (activePointers.size === 0) multiTouch = false
      if (!e.isPrimary || !down) return
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
      const isTap = moved <= down.slop && !wasMulti
      down = null

      if (useToolStore.getState().op) {
        if (wasMulti) return
        move(rayOf(e), tolForRay())
        commit()
        return
      }
      if (isTap) {
        const hit = pick(e.clientX, e.clientY, kindOf(e))
        tap(hit, hit ? tolFor(hit.point) : 0)
      }
    }

    const onCancel = (e: PointerEvent) => {
      activePointers.delete(e.pointerId)
      down = null
    }

    const onLeave = () => {
      const t = useToolStore.getState()
      t.setHover(null)
      t.setHoverPoint(null)
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
      el.removeEventListener('pointerleave', onLeave)
      cancel()
    }
  }, [camera, gl, scene, raycaster])

  return null
}
