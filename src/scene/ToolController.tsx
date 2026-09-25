import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Raycaster, Vector2, type Intersection, type Object3D } from 'three'
import { FACES, type Vec3 } from '../model/types'
import { cancel, commit, move, tap, type Hit, type PickTarget, type Ray } from '../tools/actions'
import { useToolStore } from '../store/toolStore'

/** Hur långt pekaren får röra sig och ändå räknas som ett tryck, i px. */
const TAP_SLOP = { mouse: 4, pen: 6, touch: 10 } as const
/** Snäpptolerans som andel av avståndet från kameran till träffpunkten (~15 px). */
const SNAP_FRACTION = 0.015

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

    const castRay = (e: PointerEvent): Ray => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      return { origin: raycaster.ray.origin.toArray() as Vec3, dir: raycaster.ray.direction.toArray() as Vec3 }
    }

    const pick = (ray: Ray): Hit | null => {
      // Nya objekt har ingen giltig matrixWorld förrän nästa bildruta ritats,
      // och med frameloop="demand" kan det dröja. Räkna om före raycast.
      scene.updateMatrixWorld()
      const targets: Object3D[] = []
      scene.traverse((o) => {
        if (o.userData.pick) targets.push(o)
      })
      let best: { hit: Intersection; score: number } | null = null
      for (const hit of raycaster.intersectObjects(targets, false)) {
        // Skisser ligger i samma plan som ytan under; ge dem företräde.
        const score = hit.distance - (hit.object.userData.pick.kind === 'sketch' ? 1 : 0)
        if (!best || score < best.score) best = { hit, score }
      }

      // Golvplanet y = 0, om det ligger närmare än närmaste objekt.
      const groundT = ray.dir[1] !== 0 ? -ray.origin[1] / ray.dir[1] : -1
      if (groundT > 0 && (!best || groundT < best.hit.distance)) {
        return { point: [ray.origin[0] + ray.dir[0] * groundT, 0, ray.origin[2] + ray.dir[2] * groundT], target: { kind: 'ground' } }
      }
      if (!best) return null

      const p = best.hit.object.userData.pick as { kind: 'body' | 'sketch'; id: string }
      const target: PickTarget =
        p.kind === 'body' ? { kind: 'body', id: p.id, face: FACES[best.hit.face?.materialIndex ?? 0]! } : { kind: 'sketch', id: p.id }
      return { point: best.hit.point.toArray() as Vec3, target }
    }

    const tolFor = (point: Vec3) => camera.position.distanceTo({ x: point[0], y: point[1], z: point[2] }) * SNAP_FRACTION
    const tolForRay = () => camera.position.length() * SNAP_FRACTION

    const onDown = (e: PointerEvent) => {
      activePointers.add(e.pointerId)
      if (activePointers.size > 1) multiTouch = true
      if (!e.isPrimary) return
      down = { x: e.clientX, y: e.clientY, slop: TAP_SLOP[e.pointerType as keyof typeof TAP_SLOP] ?? 6 }
      if (useToolStore.getState().op) move(castRay(e), tolForRay())
    }

    const onMove = (e: PointerEvent) => {
      if (!e.isPrimary || multiTouch) return
      const { op, tool, hover, setHover } = useToolStore.getState()
      if (op) {
        move(castRay(e), tolForRay())
        return
      }
      // Hover bara med mus; touch har ingen hover.
      if (e.pointerType === 'mouse' && e.buttons === 0 && tool === 'pushpull') {
        const t = pick(castRay(e))?.target
        const next = t && t.kind !== 'ground' ? t : null
        if (JSON.stringify(next) !== JSON.stringify(hover)) setHover(next)
      }
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
        move(castRay(e), tolForRay())
        commit()
        return
      }
      if (isTap) {
        const ray = castRay(e)
        const hit = pick(ray)
        tap(hit, hit ? tolFor(hit.point) : 0)
      }
    }

    const onCancel = (e: PointerEvent) => {
      activePointers.delete(e.pointerId)
      down = null
    }

    const onLeave = () => useToolStore.getState().setHover(null)

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
