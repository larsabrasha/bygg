import type { CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Raycaster, Vector2, Vector3, type Intersection, type Object3D, type PerspectiveCamera } from 'three'
import { toWorld } from '../model/frame'
import type { Vec2, Vec3 } from '../model/types'
import { bodyCenter } from '../model/geometry'
import { convexHull, lassoPick, segmentHits } from '../model/lasso'
import { resolveBodies } from '../model/resolve'
import { selectedBodyIds, useDocumentStore } from '../store/documentStore'
import { useLibraryStore } from '../store/libraryStore'
import { useToolStore, type Op } from '../store/toolStore'
import { isShown, useViewStore } from '../store/viewStore'
import {
  cancel,
  commit,
  doubleTap,
  handleOf,
  hoverAt,
  move,
  rulerHoverAt,
  opFocus,
  regrab,
  repeatLastPushPull,
  selectConnected,
  tap,
  type Hit,
  type Ray,
} from '../tools/actions'
import {
  afterTapStart,
  cameraButtons,
  fingerOnlyCamera,
  inSystemEdge,
  fingerTap,
  hovers,
  movesCamera,
  isDoubleTap,
  pressOwner,
  snapPx,
  TAP_SLOP,
  type Owner,
  type PointerKind,
  type TapPoint,
} from '../tools/gestures'
import { applyCameraButtons } from './camera'
import { closestObject, groundHit, ON_TOP, pickTargets, toHit } from './pick'

/**
 * Hur nära en del pekaren måste vara för att träffa den, i px. Gör tunna
 * delar (en 22 mm bräda är några px hög på avstånd) möjliga att träffa.
 */
const PICK_RADIUS: Record<PointerKind, number> = { mouse: 6, pen: 8, touch: 16 }
/** Golvet blir vridpunkt bara om det ligger högst så här många gånger längre bort än nuvarande vridpunkt. */
const MAX_GROUND_PIVOT = 1.5

const kindOf = (e: PointerEvent): PointerKind =>
  e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse'

/** Pennläget (se ViewState.penMode): då ritar pennan och fingrarna styr bara kameran. */
const penMode = () => useViewStore.getState().penMode

/** Pågående tryck med den primära pekaren. */
interface Press {
  pointerId: number
  kind: PointerKind
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
  /** En dragning ritar en slinga runt delar som läggs till i valet (Skift eller Välj fler). */
  lasso?: boolean
}

/** Så långt (px) mellan två punkter i slingan; tätare ger bara fler punkter att räkna på. */
const LASSO_STEP = 4
/** Högst så många punkter i slingan när valet räknas medan man ritar. */
const LIVE_POINTS = 256

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
    /** Fingrar som började vid skärmens kant (dockan, Safaris bakåt, se inSystemEdge): de gör ingenting. */
    const edgeTouches = new Set<number>()
    let gesture = { start: 0, fingers: 0, moved: 0 }
    /** Trycket som startade pågående operation, för dubbeltryck. */
    let startTap: TapPoint | null = null
    /** Förra trycket utan pågående operation, för dubbeltryck (se doubleTap). */
    let lastTap: TapPoint | null = null
    /**
     * De senaste två trycken (vad de än gjorde). Ett tredje tätt efter på samma ställe väljer allt som
     * sitter ihop, också när det andra träffade pilen på sidan och började dra ut den.
     */
    let recentTaps: TapPoint[] = []
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

    const closest = (targets: Object3D[]) => closestObject(raycaster, targets)

    /**
     * Träff under pekaren. Missar strålen alla objekt provas en ring runt
     * pekaren (PICK_RADIUS); först därefter räknas golvet.
     * Golvet räknas bara när kameran är ovanför det. Underifrån syns det inte,
     * och då skulle det annars ta klicken på delarnas undersidor.
     */
    const pick = (x: number, y: number, kind: PointerKind): Hit | null => {
      const targets = pickTargets(scene)
      const center = castRay(x, y)
      const direct = closest(targets)

      const floor = groundHit(center)
      const ground = floor?.hit ?? null

      if (direct && ON_TOP.has(direct.object.userData.pick.kind)) return toHit(direct)
      if (direct) return floor && floor.distance < direct.distance ? floor.hit : toHit(direct)

      const r = PICK_RADIUS[kind]
      for (const radius of [r / 2, r]) {
        let best: Intersection | null = null
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2
          castRay(x + Math.cos(a) * radius, y + Math.sin(a) * radius)
          const h = closest(targets)
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
      const kind = kindOf(e)
      const vv = window.visualViewport
      const screen = vv
        ? { left: vv.offsetLeft, right: vv.offsetLeft + vv.width, bottom: vv.offsetTop + vv.height }
        : { left: 0, right: window.innerWidth, bottom: window.innerHeight }
      // Bara ett första finger: ett andra finger vid kanten hör till en tvåfingergest.
      if (pointers.size === 0 && inSystemEdge(kind, e.clientX, e.clientY, screen)) {
        edgeTouches.add(e.pointerId)
        // camera-controls får också trycket; ett finger ska inte vrida vyn.
        if (controls) {
          const { tool } = useToolStore.getState()
          applyCameraButtons(controls, { ...cameraButtons(tool, 'camera'), one: 'none' })
        }
        return
      }
      // Pennan slår på pennläget (också om man slagit av det: då vill man rita med pennan igen).
      if (kind === 'pen' && !useViewStore.getState().penMode) {
        useViewStore.getState().setPenMode(true)
        useLibraryStore
          .getState()
          .notify('Pennläge: pennan ritar och väljer, fingrarna styr bara vyn. Slå av med pennan bland verktygen.')
      }
      const fingerOnly = fingerOnlyCamera(kind, penMode())
      // Pennan ritar: ett finger (eller handflatan) stör inte det den håller på med.
      if (fingerOnly && press?.kind === 'pen') return
      dropMove()
      // Pennan räknas inte bland fingrarna: pennan och en handflata är inte en tvåfingergest.
      if (kind !== 'pen') {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0 })
        if (pointers.size === 1) gesture = { start: e.timeStamp, fingers: 1, moved: 0 }
        gesture.fingers = Math.max(gesture.fingers, pointers.size)
      }

      if (kind !== 'pen' && pointers.size > 1) {
        // Fler fingrar: kameran tar över. Det första fingrets verkan tas tillbaka.
        multiTouch = true
        if (press?.owner === 'tool') useToolStore.getState().setOp(press.opBefore)
        if (press?.lasso) cancelLasso()
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

      lastKind = kind
      // En operation som väntar på ett mått avbryts, och trycket räknas som om den aldrig funnits.
      // Utom ett dubbeltryck på pilen: samma djup som förra gången (se onUp). Ett finger när
      // pennan används vrider bara kameran, och låter operationen vänta kvar.
      const here = { x: e.clientX, y: e.clientY, time: e.timeStamp }
      if (waiting && !fingerOnly && !isDoubleTap(startTap, here, TAP_SLOP[kind])) {
        cancel()
        op = null
      }
      const hit = pick(e.clientX, e.clientY, kind)
      // Trippeltryck på en del: allt som sitter ihop med den. De två första har valt delen och kanske
      // gått till Flytta eller börjat dra ut pilen; det avbryts, och selectConnected går till Välj.
      const [first, second] = recentTaps
      const slop = TAP_SLOP[kind]
      const triple = !!first && !!second && isDoubleTap(first, second, slop) && isDoubleTap(second, here, slop)
      const sel0 = useDocumentStore.getState().selection
      const tripleId = hit?.target.kind === 'body' ? hit.target.id : sel0?.kind === 'body' && hit ? sel0.id : null
      if (triple && tripleId && !fingerOnly) {
        recentTaps = []
        if (op) cancel()
        waiting = false
        if (controls) applyCameraButtons(controls, cameraButtons(tool, 'tool'))
        selectConnected(tripleId)
        return
      }
      const sel = useDocumentStore.getState().selection
      const onSelected = hit?.target.kind === 'body' && sel?.kind === 'body' && sel.id === hit.target.id
      // En pil som pekar rakt mot kameran går inte att dra i: ett drag där vrider vyn, så att den syns
      // (och ett tryck säger det, se tap). I sprängskissen står delarna inte där de är: trycket vrider
      // kameran eller väljer, inget annat.
      const t = hit?.target
      const headOn = (t?.kind === 'handle' || t?.kind === 'axis') && !!t.headOn
      // Skift (eller Välj fler) i Välj: en dragning ritar en slinga i stället för att vrida vyn.
      // Två fingrar vrider och zoomar som vanligt. Ett tryck väljer som förut (se onUp).
      const lasso =
        tool === 'select' &&
        !op &&
        !fingerOnly &&
        !useViewStore.getState().exploded &&
        (e.shiftKey || e.metaKey || e.ctrlKey || useToolStore.getState().adding) &&
        t?.kind !== 'handle'
      const owner = lasso
        ? 'tool'
        : useViewStore.getState().exploded || (headOn && !op) || fingerOnly
          ? 'camera'
          : pressOwner(tool, op !== null, kind, t?.kind ?? null, onSelected)
      // Pennan vrider aldrig vyn när pennläget är på: ett tryck med den väljer ändå (se onUp).
      if (controls) applyCameraButtons(controls, cameraButtons(tool, movesCamera(kind, penMode()) ? owner : 'tool'))
      press = {
        pointerId: e.pointerId,
        kind,
        x: e.clientX,
        y: e.clientY,
        slop: TAP_SLOP[kind],
        owner,
        opBefore: op,
        startedOp: false,
        afterTap: 'follow',
        ...(lasso && { lasso }),
      }

      if (owner === 'camera') {
        setPivot(e.clientX, e.clientY)
        return
      }
      if (lasso) {
        el.setPointerCapture(e.pointerId)
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
      if (edgeTouches.has(e.pointerId)) return
      const p = pointers.get(e.pointerId)
      if (p) {
        p.moved = Math.max(p.moved, Math.hypot(e.clientX - p.x, e.clientY - p.y))
        gesture.moved = Math.max(gesture.moved, p.moved)
      }
      const kind = kindOf(e)
      // Fingrar när pennan används: bara kameran, som sköter sig själv.
      if (fingerOnlyCamera(kind, penMode())) return
      if (!e.isPrimary || (multiTouch && kind !== 'pen')) return
      if (press && press.pointerId !== e.pointerId) return
      if (press?.lasso) {
        const tools = useToolStore.getState()
        const path = tools.lasso
        const here: Vec2 = [e.clientX, e.clientY]
        // Slingan börjar först när trycket blivit en dragning; ett tryck väljer som vanligt.
        if (!path) {
          if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > press.slop) {
            tools.setLasso([[press.x, press.y], here])
            startLasso()
            updateLasso([[press.x, press.y], here])
          }
          return
        }
        const last = path.at(-1)!
        if (Math.hypot(here[0] - last[0], here[1] - last[1]) >= LASSO_STEP) tools.setLasso([...path, here])
        // Valet följer slingan medan man ritar, som en ruta i Finder: slingan räknas som sluten.
        updateLasso([...path, here])
        return
      }
      const { op, tool, hover, setHover } = useToolStore.getState()
      if (op) {
        // Med mitt- eller högerknappen nere rör man kameran, inte operationen.
        if (e.pointerType === 'mouse' && (e.buttons & ~1) !== 0) return
        if (press && press.owner !== 'tool') return
        if (waiting && !press) return
        queueMove(rayOf(e))
        return
      }
      // Hover med mus och med en penna som svävar över skärmen; ett finger har ingen hover.
      // Med mellanslaget nere visas handen i stället.
      const view = useViewStore.getState()
      if (!hovers(kind, e.buttons) || view.spacePan.held || view.exploded) return
      if (tool === 'select') {
        // Handen visar att pilen går att dra i, och pilen lyser upp.
        const target = useDocumentStore.getState().selection ? pick(e.clientX, e.clientY, kind)?.target : undefined
        el.style.cursor = target?.kind === 'handle' ? 'grab' : ''
        useToolStore.getState().setHoverHandle(handleOf(target))
        return
      }
      const hit = pick(e.clientX, e.clientY, kind)
      useToolStore.getState().setHoverHandle(handleOf(hit?.target))
      if (tool === 'measure') {
        el.style.cursor = 'crosshair'
        rulerHoverAt(hit, hit ? tolFor(hit.point, kind) : 0)
        return
      }
      el.style.cursor = hit && ON_TOP.has(hit.target.kind) ? 'grab' : ''
      if (tool === 'rect' || tool === 'circle') {
        hoverAt(hit, hit ? tolFor(hit.point, kind) : 0)
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
      if (edgeTouches.delete(e.pointerId)) return
      const wasFinger = pointers.delete(e.pointerId)
      const wasMulti = multiTouch
      if (wasFinger && pointers.size === 0) {
        endGesture(e)
        multiTouch = false
      }
      // Bara pekaren som tryckte räknas: ett finger som släpps medan pennan ritar gör inget.
      if (!e.isPrimary || !press || press.pointerId !== e.pointerId) return
      // Släppet räknas med sin egen stråle nedan; en väntande rörelse är gammal.
      dropMove()
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y)
      const isTap = moved <= press.slop && !(wasMulti && press.kind !== 'pen')
      const p = press
      press = null
      recentTaps = isTap ? [...recentTaps.slice(-1), { x: e.clientX, y: e.clientY, time: e.timeStamp }] : []

      if (p.lasso) {
        const path = useToolStore.getState().lasso
        useToolStore.getState().setLasso(null)
        if (path) {
          finishLasso([...path, [e.clientX, e.clientY]])
          return
        }
      }

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
      if (isTap && (p.owner === 'camera' || p.lasso)) {
        // Ett finger i pennläget gör inget med modellen, som i Shapr3D: det styr bara vyn.
        // (Tvåfinger- och trefingertryck för ångra och gör om räknas ändå, se endGesture.)
        if (fingerOnlyCamera(p.kind, penMode())) return
        const kind = kindOf(e)
        const hit = pick(e.clientX, e.clientY, kind)
        const here = { x: e.clientX, y: e.clientY, time: e.timeStamp }
        if (useViewStore.getState().exploded) {
          const t = hit?.target
          useDocumentStore.getState().select(t?.kind === 'body' ? { kind: 'body', id: t.id } : null)
          return
        }
        // Dubbeltryck på en del: Flytta/vrid. Första trycket har redan valt den.
        const adding = e.shiftKey || e.metaKey || e.ctrlKey
        if (!adding && isDoubleTap(lastTap, here, p.slop) && doubleTap(hit)) {
          lastTap = null
          return
        }
        lastTap = here
        const before = useToolStore.getState().op
        // Skift-, ⌘- eller Ctrl-klick lägger till i valet eller tar bort ur det, som i Finder och SketchUp.
        tap(hit, hit ? tolFor(hit.point, kind) : 0, adding)
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
      if (edgeTouches.delete(e.pointerId)) return
      pointers.delete(e.pointerId)
      if (pointers.size === 0) multiTouch = false
      if (press?.pointerId !== e.pointerId) return
      dropMove()
      if (press.owner === 'tool') useToolStore.getState().setOp(press.opBefore)
      if (press.lasso) cancelLasso()
      press = null
    }

    /**
     * Slingan som ritas: valet före den, delarnas mitt och kontur på skärmen (kameran står still medan
     * man ritar), och delarna som slingan träffat hittills.
     */
    let live: {
      base: string[]
      centers: Map<string, Vec2 | null>
      /** Konturen (konvexa höljet av lådans hörn) och rutan runt den; saknas för delar bakom kameran. */
      outlines: Map<string, { hull: Vec2[]; box: [number, number, number, number] }>
      /** Träffade delar, i den ordning de träffades. Valet växer bara medan man ritar. */
      hit: string[]
      hitSet: Set<string>
      /** Så många punkter i slingan är redan prövade som linje (se pickLasso). */
      done: number
      /** Punkterna som väntar på nästa bildruta, och den väntande bildrutan (0 = ingen). */
      points: Vec2[]
      frame: number
    } | null = null

    const startLasso = () => {
      const r = el.getBoundingClientRect()
      const view = useViewStore.getState()
      const docs = useDocumentStore.getState()
      const at = new Vector3()
      const screen = (p: Vec3): Vec2 | null => {
        at.set(...p).project(camera)
        // Bakom kameran, eller långt utanför bilden.
        return at.z > 1 ? null : [r.left + ((at.x + 1) / 2) * r.width, r.top + ((1 - at.y) / 2) * r.height]
      }
      const centers = new Map<string, Vec2 | null>()
      const outlines = new Map<string, { hull: Vec2[]; box: [number, number, number, number] }>()
      // De som syns, utom verktygen (Skär ut, tappar).
      for (const b of resolveBodies(docs.doc)) {
        if (b.tool || !isShown(view, b.id)) continue
        centers.set(b.id, screen(bodyCenter(b)))
        const { profile: q, z0, z1 } = b
        const corners: Vec2[] = []
        for (const x of [q.x0, q.x1])
          for (const y of [q.y0, q.y1])
            for (const z of [z0, z1]) {
              const c = screen(toWorld(b.frame, [x, y, z]))
              if (c) corners.push(c)
            }
        if (corners.length < 8) continue
        const hull = convexHull(corners)
        const xs = hull.map((c) => c[0])
        const ys = hull.map((c) => c[1])
        outlines.set(b.id, { hull, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] })
      }
      live = {
        base: selectedBodyIds(docs),
        centers,
        outlines,
        hit: [],
        hitSet: new Set(),
        done: 0,
        points: [],
        frame: 0,
      }
      // Pekningen uppdateras inte medan man ritar; en markerad sida från före dragningen skulle lysa kvar.
      const t = useToolStore.getState()
      t.setHover(null)
      t.setHoverPoint(null)
      t.setHoverHandle(null)
    }

    /**
     * points: slingans punkter och sist pekaren. Valet räknas högst en gång per bildruta: pekaren
     * skickar ofta fler händelser än skärmen visar.
     */
    const updateLasso = (points: Vec2[]) => {
      if (!live) return
      live.points = points
      if (live.frame) return
      live.frame = requestAnimationFrame(() => {
        if (!live) return
        live.frame = 0
        pickLasso(live.points, true)
      })
    }

    /**
     * Valet är det som var valt före slingan plus alla delar slingan träffat: linjen har dragits över
     * dem, eller de har legat innanför slingan (räknad som sluten). En träffad del stannar i valet
     * tills man släpper, hur slingan än svänger. Den sist träffade blir den valda.
     * thin: under dragningen räcker en glesare slinga för det som är innanför; 2000 delar mot 1000
     * punkter tog 13 ms, nästan en hel bildruta. Släppet räknas med alla punkter.
     */
    const pickLasso = (points: Vec2[], thin: boolean) => {
      if (!live) return
      const l = live
      const before = l.hit.length
      const add = (id: string) => {
        if (l.hitSet.has(id)) return
        l.hitSet.add(id)
        l.hit.push(id)
      }
      const line = (a: Vec2, b: Vec2) => {
        const [x0, x1] = a[0] < b[0] ? [a[0], b[0]] : [b[0], a[0]]
        const [y0, y1] = a[1] < b[1] ? [a[1], b[1]] : [b[1], a[1]]
        for (const [id, o] of l.outlines)
          if (!l.hitSet.has(id) && x1 >= o.box[0] && x0 <= o.box[2] && y1 >= o.box[1] && y0 <= o.box[3])
            if (segmentHits(a, b, o.hull)) add(id)
      }
      // Linjen: de punkter som ligger kvar i slingan prövas en gång, sträckan till pekaren varje gång.
      const kept = points.length - 1
      for (let i = Math.max(1, l.done); i < kept; i++) line(points[i - 1]!, points[i]!)
      l.done = Math.max(l.done, kept)
      if (kept >= 1) line(points[kept - 1]!, points[kept]!)
      // Innanför slingan.
      const step = thin ? Math.ceil(points.length / LIVE_POINTS) : 1
      const ring = step > 1 ? points.filter((_, i) => i % step === 0 || i === points.length - 1) : points
      for (const id of lassoPick(l.centers, ring)) add(id)
      if (l.hit.length === before) return
      useDocumentStore.getState().selectBodies([...l.base.filter((id) => !l.hitSet.has(id)).reverse(), ...l.hit])
    }

    const finishLasso = (points: Vec2[]) => {
      if (live?.frame) cancelAnimationFrame(live.frame)
      // Släppet räknas direkt, så att valet är klart när trycket är slut.
      pickLasso(points, false)
      live = null
    }

    /** Avbruten slinga (ett finger till, eller pekaren tappad): valet blir som före den. */
    const cancelLasso = () => {
      useToolStore.getState().setLasso(null)
      if (live?.frame) cancelAnimationFrame(live.frame)
      if (live) useDocumentStore.getState().selectBodies([...live.base].reverse())
      live = null
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
      t.setHoverHandle(null)
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
