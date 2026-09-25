import type { CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Raycaster, Vector2, Vector3, type Intersection, type Object3D, type PerspectiveCamera } from 'three'
import { circleFace, faceOnBox, type Box } from '../model/geometry'
import { FACES, type Face, type Vec3 } from '../model/types'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore, type Op } from '../store/toolStore'
import { useViewStore } from '../store/viewStore'
import {
  cancel,
  commit,
  doubleTap,
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
  afterTapStart,
  cameraButtons,
  fingerTap,
  isDoubleTap,
  pickable,
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
 * Push/pull-pilen, flyttpilarna och bågarna ritas ovanpå allt (de sitter på
 * eller mitt i delen och kan skymmas av andra delar), så de vinner alltid
 * över det som ligger närmare kameran.
 */
const ON_TOP = new Set<string>(['handle', 'axis', 'rotate'])

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
  /** Vad operationen gör om trycket inte blir en dragning (se afterTapStart). */
  afterTap: ReturnType<typeof afterTapStart>
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
    const screenUp = new Vector3()
    let press: Press | null = null
    let multiTouch = false
    /** Alla nedtryckta pekare med startpunkt och hur långt de rört sig, för flerfingertryck. */
    const pointers = new Map<number, { x: number; y: number; moved: number }>()
    let gesture = { start: 0, fingers: 0, moved: 0 }
    /** Trycket som startade pågående operation, för dubbeltryck. */
    let startTap: TapPoint | null = null
    /** Förra trycket utan pågående operation, för dubbeltryck (se doubleTap). */
    let lastTap: TapPoint | null = null
    /**
     * Operationen som den såg ut när den började. Följer den musen (klicka,
     * flytta, klicka) och musen lämnar vyn, t.ex. för att skriva i måttrutan,
     * går den tillbaka hit. Annars drar vägen dit ytan eller delen långt iväg.
     */
    let opAtStart = useToolStore.getState().op
    /**
     * Operationen står still tills man skriver ett mått, och nästa tryck avbryter
     * den. Så blir det när den startades med ett tryck på en pil eller båge (se
     * afterTapStart), eller utanför vyn (knappen Dra ut): annars hoppade ytan dit
     * pekaren råkade komma in i vyn, och nästa tryck sparade det.
     */
    let waiting = false

    const castRay = (x: number, y: number): Ray => {
      const r = el.getBoundingClientRect()
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      return {
        origin: raycaster.ray.origin.toArray() as Vec3,
        dir: raycaster.ray.direction.toArray() as Vec3,
        up: screenUp.setFromMatrixColumn(camera.matrixWorld, 1).toArray() as Vec3,
      }
    }
    const rayOf = (e: PointerEvent) => castRay(e.clientX, e.clientY)

    const pickTargets = (): Object3D[] => {
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

    /**
     * Närmaste objekt längs den senast kastade strålen. Skisser och verktyg (spöken)
     * får företräde framför ytan de ligger på, som ett tapphål i sin värds yta.
     */
    const closestObject = (targets: Object3D[]): Intersection | null => {
      let best: { hit: Intersection; score: number } | null = null
      for (const hit of raycaster.intersectObjects(targets, false)) {
        const { kind, tool } = hit.object.userData.pick
        const score = ON_TOP.has(kind) ? -Infinity : hit.distance - (kind === 'sketch' || tool ? 1 : 0)
        if (!best || score < best.score) best = { hit, score }
      }
      return best?.hit ?? null
    }

    const toHit = (hit: Intersection): Hit => {
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
     * Träff under pekaren. Missar strålen alla objekt provas en ring runt
     * pekaren (PICK_RADIUS); först därefter räknas golvet.
     * Golvet räknas bara när kameran är ovanför det. Underifrån syns det inte,
     * och då skulle det annars ta klicken på delarnas undersidor.
     */
    const pick = (x: number, y: number, kind: PointerKind): Hit | null => {
      const targets = pickTargets()
      const center = castRay(x, y)
      const direct = closestObject(targets)

      const groundT = center.dir[1] !== 0 ? -center.origin[1] / center.dir[1] : -1
      const ground: Hit | null =
        groundT > 0 && center.origin[1] > 0
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

    /**
     * Under en operation räknas pekaren högst en gång per bildruta, med den senaste
     * strålen. En telefon skickar fler pekarhändelser än den ritar bilder, och varje
     * steg kan betyda att en del med hål räknas om (manifold).
     */
    let pendingRay: Ray | null = null
    let moveFrame = 0
    const dropMove = () => {
      if (moveFrame) cancelAnimationFrame(moveFrame)
      moveFrame = 0
      pendingRay = null
    }
    const queueMove = (ray: Ray) => {
      pendingRay = ray
      if (moveFrame) return
      moveFrame = requestAnimationFrame(() => {
        moveFrame = 0
        const r = pendingRay
        pendingRay = null
        if (r && useToolStore.getState().op) move(r, tolForOp())
      })
    }

    const onDown = (e: PointerEvent) => {
      dropMove()
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

      const { tool } = useToolStore.getState()
      let { op } = useToolStore.getState()
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
      // En operation som väntar på ett mått avbryts, och trycket räknas som om den aldrig funnits.
      // Utom ett dubbeltryck på pilen: samma djup som förra gången (se onUp).
      const here = { x: e.clientX, y: e.clientY, time: e.timeStamp }
      if (waiting && !isDoubleTap(startTap, here, TAP_SLOP[kind])) {
        cancel()
        op = null
      }
      const hit = pick(e.clientX, e.clientY, kind)
      const sel = useDocumentStore.getState().selection
      const onSelected = hit?.target.kind === 'body' && sel?.kind === 'body' && sel.id === hit.target.id
      // En pil som pekar rakt mot kameran går inte att dra i: ett drag där vrider vyn, så att den syns
      // (och ett tryck säger det, se tap). I sprängskissen står delarna inte där de är: trycket vrider
      // kameran eller väljer, inget annat.
      const t = hit?.target
      const headOn = (t?.kind === 'handle' || t?.kind === 'axis') && !!t.headOn
      const owner =
        useViewStore.getState().exploded || (headOn && !op)
          ? 'camera'
          : pressOwner(tool, op !== null, kind, t?.kind ?? null, onSelected)
      if (controls) applyCameraButtons(controls, cameraButtons(tool, owner))
      press = {
        x: e.clientX,
        y: e.clientY,
        slop: TAP_SLOP[kind],
        owner,
        opBefore: op,
        startedOp: false,
        afterTap: 'follow',
      }

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
        const started = useToolStore.getState().op
        press.startedOp = started !== null
        if (started) press.afterTap = afterTapStart(hit?.target.kind ?? null, started)
        // Greppunkten räknas från pekarens stråle, som dragningen. Träffpunkten
        // på pilens tjocka träffyta ligger närmare kameran och skulle ge ett hopp.
        regrab(rayOf(e))
        if (press.startedOp) opAtStart = useToolStore.getState().op
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
        if (waiting && !press) return
        queueMove(rayOf(e))
        return
      }
      // Hover bara med mus; touch har ingen hover. Med mellanslaget nere visas handen i stället.
      const view = useViewStore.getState()
      if (e.pointerType !== 'mouse' || e.buttons !== 0 || view.spacePan.held || view.exploded) return
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
      if (tool === 'rect' || tool === 'circle') {
        hoverAt(hit, hit ? tolFor(hit.point, 'mouse') : 0)
        return
      }
      const t = hit?.target
      const next =
        t?.kind === 'body' && t.face
          ? { kind: 'body' as const, id: t.id, face: t.face }
          : t?.kind === 'sketch' && tool === 'pushpull'
            ? t
            : null
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
      // Släppet räknas med sin egen stråle nedan; en väntande rörelse är gammal.
      dropMove()
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
          if (p.afterTap === 'drop') {
            cancel()
            return
          }
          waiting = p.afterTap === 'wait'
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
        const here = { x: e.clientX, y: e.clientY, time: e.timeStamp }
        if (useViewStore.getState().exploded) {
          const t = hit?.target
          useDocumentStore.getState().select(t?.kind === 'body' ? { kind: 'body', id: t.id } : null)
          return
        }
        // Dubbeltryck på en del: Flytta/vrid. Första trycket har redan valt den.
        if (isDoubleTap(lastTap, here, p.slop) && doubleTap(hit)) {
          lastTap = null
          return
        }
        lastTap = here
        const before = useToolStore.getState().op
        tap(hit, hit ? tolFor(hit.point, kind) : 0)
        // Trycket startade något (första hörnet på en rektangel med mus): samma regel som i onDown,
        // inte som en operation från utanför vyn.
        const started = useToolStore.getState().op
        if (started && !before) {
          const after = afterTapStart(hit?.target.kind ?? null, started)
          if (after === 'drop') cancel()
          else waiting = after === 'wait'
        }
      }
    }

    const onCancel = (e: PointerEvent) => {
      dropMove()
      pointers.delete(e.pointerId)
      if (pointers.size === 0) multiTouch = false
      if (press?.owner === 'tool') useToolStore.getState().setOp(press.opBefore)
      press = null
    }

    const onLeave = () => {
      const t = useToolStore.getState()
      // Ingen knapp nere: operationen följde bara musen. Med en dragning pågår den till släppet.
      // Valet Ny del / Lägg till / Skär ut i måttrutan görs utanför vyn och ska ligga kvar.
      if (t.op && !press && opAtStart)
        t.setOp(
          opAtStart.kind === 'pushpull' && t.op.kind === 'pushpull' ? { ...opAtStart, mode: t.op.mode } : opAtStart,
        )
      t.setHover(null)
      t.setHoverPoint(null)
      if (t.rulerHover) t.setRulerHover(null)
    }

    // Handen visar att man kan panorera medan mellanslaget är nere.
    const unsubscribeOp = useToolStore.subscribe((s, prev) => {
      if (!s.op) {
        opAtStart = null
        waiting = false
      } else if (!prev.op) {
        opAtStart = s.op
        if (!press) waiting = true
      }
    })

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
      unsubscribeOp()
      dropMove()
      cancel()
    }
  }, [camera, gl, scene, raycaster, controls])

  return null
}
