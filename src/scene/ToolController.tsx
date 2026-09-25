import type { CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Raycaster, Vector2, type Intersection, type Object3D, type PerspectiveCamera } from 'three'
import { FACES, type Vec3 } from '../model/types'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore, type Op } from '../store/toolStore'
import { useViewStore } from '../store/viewStore'
import {
  cancel,
  commit,
  hoverAt,
  move,
  rulerHoverAt,
  opFocus,
  regrab,
  repeatLastPushPull,
  tap,
  type Hit,
  type PickTarget,
  type Ray,
} from '../tools/actions'
import {
  cameraButtons,
  fingerTap,
  isDoubleTap,
  pressOwner,
  snapPx,
  TAP_SLOP,
  type Owner,
  type PointerKind,
  type TapPoint,
} from '../tools/gestures'
import { applyCameraButtons } from './camera'

/**
 * Hur nära en del pekaren måste vara för att träffa den, i px. Gör tunna
 * delar (en 22 mm bräda är några px hög på avstånd) möjliga att träffa.
 */
const PICK_RADIUS: Record<PointerKind, number> = { mouse: 6, pen: 8, touch: 16 }
/** Golvet blir vridpunkt bara om det ligger högst så här många gånger längre bort än nuvarande vridpunkt. */
const MAX_GROUND_PIVOT = 1.5

/**
 * Flyttpilarna och bågarna ritas ovanpå allt (de sitter mitt i delen), så de
 * vinner alltid över det som ligger närmare kameran.
 */
const ON_TOP = new Set<string>(['axis', 'rotate'])

const kindOf = (e: PointerEvent): PointerKind =>
  e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse'

/** Pågående tryck med den primära pekaren. */
interface Press {
  x: number
  y: number
  slop: number
  owner: Owner
  /** Operationen före trycket; återställs om trycket blir en tvåfingergest. */
  opBefore: Op | null
  /** Trycket startade en operation (drar man inte, väntar den på nästa tryck). */
  startedOp: boolean
}

/**
 * Översätter pekarhändelser till verktygsanrop och styr vad kameran får göra
 * (se gestures.ts). Egen raycasting mot objekt med userData.pick, plus golvplanet
 * y = 0. R3F:s egna mesh-händelser används inte.
 */
export function ToolController() {
  const { camera, gl, scene } = useThree()
  const controls = useThree((s) => s.controls) as CameraControlsImpl | null
  const raycaster = useMemo(() => new Raycaster(), [])

  useEffect(() => {
    const el = gl.domElement
    const ndc = new Vector2()
    let press: Press | null = null
    let multiTouch = false
    /** Alla nedtryckta pekare med startpunkt och hur långt de rört sig, för flerfingertryck. */
    const pointers = new Map<number, { x: number; y: number; moved: number }>()
    let gesture = { start: 0, fingers: 0, moved: 0 }
    /** Trycket som startade pågående operation, för dubbeltryck. */
    let startTap: TapPoint | null = null

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
        const kind = hit.object.userData.pick.kind
        const score = ON_TOP.has(kind) ? -Infinity : hit.distance - (kind === 'handle' ? 2 : kind === 'sketch' ? 1 : 0)
        if (!best || score < best.score) best = { hit, score }
      }
      return best?.hit ?? null
    }

    const toHit = (hit: Intersection): Hit => {
      const p = hit.object.userData.pick as
        { kind: 'body' | 'sketch'; id: string } | Extract<PickTarget, { kind: 'handle' | 'axis' | 'rotate' }>
      const target: PickTarget =
        p.kind === 'handle' || p.kind === 'axis' || p.kind === 'rotate'
          ? p
          : p.kind === 'body'
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

      if (direct && ON_TOP.has(direct.object.userData.pick.kind)) return toHit(direct)
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

    /** Pekaren som senast trycktes ned; operationen snäpper efter den. */
    let lastKind: PointerKind = 'mouse'
    /**
     * Snäpptolerans i mm vid en punkt: snapPx pixlar omräknat med kamerans
     * avstånd dit, så att den är lika stor på skärmen var man än är.
     */
    const tolFor = (point: Vec3, kind: PointerKind = lastKind) => {
      const d = camera.position.distanceTo({ x: point[0], y: point[1], z: point[2] })
      const fov = ((camera as PerspectiveCamera).fov * Math.PI) / 180
      const mmPerPx = (2 * d * Math.tan(fov / 2)) / Math.max(1, el.clientHeight)
      return mmPerPx * snapPx(useToolStore.getState().tool, kind)
    }
    /**
     * Tolerans under en operation. Från kamerans avstånd till det man drar i,
     * inte till origo: kameran kan stå nära modellen men långt från origo.
     */
    const tolForOp = () => {
      const { op } = useToolStore.getState()
      return op ? tolFor(opFocus(op)) : 0
    }

    /**
     * Kameran vrider runt det man trycker på, inte runt en fast punkt.
     * Förhandsvisade delar räknas också: när andra fingret landar kan det
     * första just ha startat en operation, och scenen är inte omritad än.
     */
    const setPivot = (x0: number, y0: number) => {
      if (!controls) return
      scene.updateMatrixWorld()
      const targets: Object3D[] = []
      scene.traverse((o) => {
        if (o.userData.pick || o.userData.pivot) targets.push(o)
      })
      const ray = castRay(x0, y0)
      const hit = raycaster.intersectObjects(targets, false)[0]
      let point: Vec3 | null = hit ? (hit.point.toArray() as Vec3) : null
      if (!point && ray.dir[1] < 0) {
        const t = -ray.origin[1] / ray.dir[1]
        // Golvet långt bort ger en vridpunkt som slänger iväg modellen.
        if (t <= controls.distance * MAX_GROUND_PIVOT)
          point = [ray.origin[0] + ray.dir[0] * t, 0, ray.origin[2] + ray.dir[2] * t]
      }
      if (!point) return
      const [x, y, z] = point
      // setOrbitPoint klarar inte en pågående glidning (t.ex. "Visa allt"): hoppa till dess slut först.
      controls.stop()
      controls.update(0)
      controls.setOrbitPoint(x, y, z)
    }

    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0 })
      if (pointers.size === 1) gesture = { start: e.timeStamp, fingers: 1, moved: 0 }
      gesture.fingers = Math.max(gesture.fingers, pointers.size)

      if (pointers.size > 1) {
        // Fler fingrar: kameran tar över. Det första fingrets verkan tas tillbaka.
        multiTouch = true
        if (press?.owner === 'tool') useToolStore.getState().setOp(press.opBefore)
        press = null
        // Två fingrar vrider runt det som ligger mellan dem.
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()]
          if (a && b) setPivot((a.x + b.x) / 2, (a.y + b.y) / 2)
        }
        return
      }
      if (!e.isPrimary) return

      const { tool, op } = useToolStore.getState()
      // Mitt- och högerknappen styr bara kameran; mittknappen vrider under en operation.
      if (e.pointerType === 'mouse' && e.button !== 0) {
        if (controls) applyCameraButtons(controls, cameraButtons(tool, op ? 'tool' : 'camera'))
        return
      }
      // Mellanslag nere: vänsterknappen panorerar och gör inget med verktyget.
      const view = useViewStore.getState()
      if (e.pointerType === 'mouse' && view.spacePan.held) {
        view.setSpacePan({ held: true, used: true })
        if (controls) applyCameraButtons(controls, cameraButtons(tool, 'camera', true))
        return
      }

      const kind = kindOf(e)
      lastKind = kind
      const hit = pick(e.clientX, e.clientY, kind)
      const owner = pressOwner(tool, op !== null, kind, hit?.target.kind ?? null)
      if (controls) applyCameraButtons(controls, cameraButtons(tool, owner))
      press = { x: e.clientX, y: e.clientY, slop: TAP_SLOP[kind], owner, opBefore: op, startedOp: false }

      if (owner === 'camera') {
        setPivot(e.clientX, e.clientY)
        return
      }
      // Släpp utanför vyn ska ändå avsluta dragningen.
      el.setPointerCapture(e.pointerId)
      // Push/pull och flytt längs en pil tar nytt tag där de är; andra operationer följer pekaren direkt.
      if (op) {
        if (!regrab(rayOf(e))) move(rayOf(e), tolForOp())
      } else {
        tap(hit, hit ? tolFor(hit.point) : 0)
        press.startedOp = useToolStore.getState().op !== null
        // Greppunkten räknas från pekarens stråle, som dragningen. Träffpunkten
        // på pilens tjocka träffyta ligger närmare kameran och skulle ge ett hopp.
        regrab(rayOf(e))
      }
    }

    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId)
      if (p) {
        p.moved = Math.max(p.moved, Math.hypot(e.clientX - p.x, e.clientY - p.y))
        gesture.moved = Math.max(gesture.moved, p.moved)
      }
      if (!e.isPrimary || multiTouch) return
      const { op, tool, hover, setHover } = useToolStore.getState()
      if (op) {
        // Med mitt- eller högerknappen nere rör man kameran, inte operationen.
        if (e.pointerType === 'mouse' && (e.buttons & ~1) !== 0) return
        if (press && press.owner !== 'tool') return
        move(rayOf(e), tolForOp())
        return
      }
      // Hover bara med mus; touch har ingen hover. Med mellanslaget nere visas handen i stället.
      if (e.pointerType !== 'mouse' || e.buttons !== 0 || useViewStore.getState().spacePan.held) return
      if (tool === 'select') {
        // Handen visar att pilen går att dra i.
        const onHandle =
          useDocumentStore.getState().selection && pick(e.clientX, e.clientY, 'mouse')?.target.kind === 'handle'
        el.style.cursor = onHandle ? 'grab' : ''
        return
      }
      const hit = pick(e.clientX, e.clientY, 'mouse')
      if (tool === 'measure') {
        el.style.cursor = 'crosshair'
        rulerHoverAt(hit, hit ? tolFor(hit.point, 'mouse') : 0)
        return
      }
      el.style.cursor = hit && ON_TOP.has(hit.target.kind) ? 'grab' : ''
      if (tool === 'rect') {
        hoverAt(hit, hit ? tolFor(hit.point, 'mouse') : 0)
        return
      }
      const t = hit?.target
      const next = t && (t.kind === 'body' || (t.kind === 'sketch' && tool === 'pushpull')) ? t : null
      if (JSON.stringify(next) !== JSON.stringify(hover)) setHover(next)
    }

    /** Sista fingret släpptes efter ett snabbt tryck med två eller tre fingrar: ångra eller gör om. */
    const endGesture = (e: PointerEvent) => {
      if (gesture.fingers < 2) return
      const action = fingerTap(gesture.fingers, e.timeStamp - gesture.start, gesture.moved)
      if (!action) return
      const tools = useToolStore.getState()
      const docs = useDocumentStore.getState()
      if (tools.op) cancel()
      else if (action === 'undo') docs.undo()
      else docs.redo()
    }

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      const wasMulti = multiTouch
      if (pointers.size === 0) {
        endGesture(e)
        multiTouch = false
      }
      if (!e.isPrimary || !press) return
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y)
      const isTap = moved <= press.slop && !wasMulti
      const p = press
      press = null

      if (useToolStore.getState().op) {
        if (wasMulti || p.owner !== 'tool') return
        const here = { x: e.clientX, y: e.clientY, time: e.timeStamp }
        // Ett tryck som startade operationen väntar på nästa tryck; en dragning avslutar den.
        if (isTap && p.startedOp) {
          startTap = here
          return
        }
        // Dubbeltryck på en yta: samma djup som förra gången.
        if (isTap && isDoubleTap(startTap, here, p.slop) && repeatLastPushPull()) return
        move(rayOf(e), tolForOp())
        commit()
        return
      }
      if (isTap && p.owner === 'camera') {
        const kind = kindOf(e)
        const hit = pick(e.clientX, e.clientY, kind)
        tap(hit, hit ? tolFor(hit.point, kind) : 0)
      }
    }

    const onCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size === 0) multiTouch = false
      if (press?.owner === 'tool') useToolStore.getState().setOp(press.opBefore)
      press = null
    }

    const onLeave = () => {
      const t = useToolStore.getState()
      t.setHover(null)
      t.setHoverPoint(null)
      if (t.rulerHover) t.setRulerHover(null)
    }

    // Handen visar att man kan panorera medan mellanslaget är nere.
    const unsubscribePan = useViewStore.subscribe((s, prev) => {
      if (s.spacePan.held !== prev.spacePan.held) el.style.cursor = s.spacePan.held ? 'grab' : ''
    })

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
      unsubscribePan()
      cancel()
    }
  }, [camera, gl, scene, raycaster, controls])

  return null
}
