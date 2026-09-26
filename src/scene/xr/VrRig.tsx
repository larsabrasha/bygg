import { useFrame, useThree } from '@react-three/fiber'
import { XROrigin } from '@react-three/xr'
import { useEffect, useMemo, useRef } from 'react'
import {
  Box3,
  Euler,
  Matrix4,
  Quaternion,
  Raycaster,
  Vector3,
  type ArrayCamera,
  type Group,
  type Mesh,
  type Object3D,
} from 'three'
import type { Vec3 } from '../../model/types'
import { useDocumentStore } from '../../store/documentStore'
import { useLibraryStore } from '../../store/libraryStore'
import { useToolStore } from '../../store/toolStore'
import { useViewStore } from '../../store/viewStore'
import {
  cancel,
  commit,
  doubleTap,
  hoverAt,
  move,
  opFocus,
  regrab,
  rulerHoverAt,
  tap,
  type Hit,
  type Ray,
} from '../../tools/actions'
import { afterTapStart } from '../../tools/gestures'
import { closestObject, groundHit, ON_TOP, pickTargets, toHit } from '../pick'
import {
  DEAD_ZONE,
  grabRig,
  MM_PER_M,
  SNAP_TURN,
  startPlacement,
  turnAround,
  walkStep,
  type HandYaw,
} from './locomotion'
import { legendMatrix, menuMatrix } from './menuPose'
import { fixScaledXrCamera } from './xrCulling'
import { formatVrReport, newVrReport, recordFrame, recordSource } from './vrReport'
import { runMenuAction, uiTargets, useVrHover, type VrUi } from './menuActions'
import { VrLegend, VrMenu } from './VrMenu'
import { useInVr } from './xrStore'

/**
 * Knapparna i WebXR:s standardlayout (xr-standard), som alla vanliga
 * handkontroller följer, också PS VR2:s Sense via SteamVR.
 */
const TRIGGER = 0
const SQUEEZE = 1
/** Spaken intryckt: döljer och visar skyltarna om knapparna. */
const STICK_PRESS = 3
/** A/X och B/Y. */
const LOWER = 4
const UPPER = 5
/** Styrspaken: axes[2] höger, axes[3] bakåt. */
const STICK_X = 2
const STICK_Y = 3

/**
 * Snäpptolerans som vinkel sett från huvudet: 0,4°, ungefär 10 mm på 1,5 m avstånd, som
 * snapPx pixlar med mus i 3D-vyn. Större drar operationen till mål man inte siktar på.
 */
const TOL_RAD = 0.007
/** Så mycket får strålen vridas (radianer) eller flyttas (mm) innan ett tryck räknas som en dragning. */
const DRAG_RAD = 0.035
const DRAG_MM = 30
/** Skyltarna om vad knapparna gör (se VrLegend). */
const LEGEND_RIGHT =
  'Avtryckare: välj och dra\nGrepp: håll i världen\nSpak: vrid dig\nA: ångra    B: gör om\nTryck in spaken: dölj'
const LEGEND_LEFT = 'Spak: gå\nTryck in spaken: dölj'

/** Två tryck på samma del inom så här många ms är ett dubbeltryck. */
const DOUBLE_TAP_MS = 400
/** Strålen när den inte träffar något, i mm. */
const RAY_MM = 4000

declare global {
  interface Window {
    __xrOrigin?: Object3D
  }
}

/** Pågående tryck med avtryckaren. */
interface Press {
  dir: Vector3
  origin: Vector3
  /** Trycket startade en operation (drar man inte, följer den strålen till nästa tryck). */
  startedOp: boolean
  afterTap: ReturnType<typeof afterTapStart>
}

interface Hand {
  buttons: boolean[]
  press: Press | null
  /** Högra spaken har vridit och inte varit i mitten sedan dess. */
  turned: boolean
  /** Avtryckaren trycktes på en knapp i menyn: släppet hör till den, inte till verktyget. */
  uiPress: boolean
  /** Senaste trycket på en del, för dubbeltryck. */
  lastTap: { time: number; id: string } | null
  /** Handen i världen när greppknappen trycktes in (se grabRig); null när den inte hålls. */
  grab: HandYaw | null
}

/**
 * Spelaren i VR: origo i verklig storlek (MM_PER_M), gång och vridning med
 * spakarna, och en stråle från handkontrollen som gör det pekaren gör i
 * 3D-vyn (ToolController). Avtryckaren trycker (tap), och dras det medan den
 * hålls nere följer operationen strålen tills man släpper.
 *
 * Vänster spak går, höger spak vrider i ryck. Strålen kommer från den hand
 * vars avtryckare trycktes senast. Högra greppknappen tar tag i världen:
 * håll in och dra eller vrid handen. A/X ångrar och B/Y gör om (eller avbryter
 * en operation som pågår).
 */
export function VrRig() {
  const inVr = useInVr()

  // Med origo skalat gallrar three.js bort hela modellen (se fixScaledXrCamera). Scenens
  // onBeforeRender körs efter att XR-kameran räknats och före gallringen.
  // Scenen hämtas med get(): den ändras här, och värden från en hook får inte ändras.
  const get = useThree((s) => s.get)
  useEffect(() => {
    const { scene } = get()
    const before = scene.onBeforeRender
    scene.onBeforeRender = function (renderer, sc, camera, ...rest) {
      before.call(this, renderer, sc, camera, ...rest)
      if ((camera as ArrayCamera).isArrayCamera) fixScaledXrCamera(camera as ArrayCamera)
    }
    return () => {
      scene.onBeforeRender = before
    }
  }, [get])

  return (
    <>
      <XROrigin scale={MM_PER_M} />
      {inVr && <Controllers />}
    </>
  )
}

/** Strålen och spakarna under en VR-session. Origo är gruppen som XROrigin lagt XR-kameran i. */
function Controllers() {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const raycaster = useMemo(() => new Raycaster(), [])
  const hands = useMemo(() => new Map<XRHandedness, Hand>(), [])
  const pointerHand = useRef<XRHandedness>('right')
  const beam = useRef<Group>(null)
  const beamLine = useRef<Mesh>(null)
  const cursor = useRef<Mesh>(null)
  const menu = useRef<Group>(null)
  const legendLeft = useRef<Group>(null)
  const legendRight = useRef<Group>(null)
  const legendsOn = useRef(true)
  const report = useMemo(() => newVrReport(), [])

  // Hjälpobjekt, så att inget skapas varje bildruta.
  const tmp = useMemo(
    () => ({
      m: new Matrix4(),
      pos: new Vector3(),
      dir: new Vector3(),
      q: new Quaternion(),
      s: new Vector3(),
      head: new Vector3(),
      hand: new Vector3(),
      up: new Vector3(),
      euler: new Euler(0, 0, 0, 'YXZ'),
      z: new Vector3(0, 0, -1),
    }),
    [],
  )

  // Där man står när VR startar: framför modellen. En gång per session: en hot reload
  // monterar om den här komponenten, och då ska man stå kvar där man gått. Hover och
  // markör tas bort när VR avslutas, så att inget hänger kvar i 3D-vyn.
  useEffect(() => {
    const cam = gl.xr.getCamera()
    const rig = cam.parent
    const session = gl.xr.getSession()
    // Bara i dev: webbläsartester läser var man står härifrån.
    if (import.meta.env.DEV) window.__xrOrigin = rig ?? undefined
    // Sessionen sparas på origo, som står kvar över en hot reload (en variabel här gör det inte).
    if (rig && session && rig.userData.placedFor !== session) {
      rig.userData.placedFor = session
      scene.updateMatrixWorld()
      const box = new Box3()
      scene.traverse((o) => {
        if (o.userData.pick) box.expandByObject(o)
      })
      const center = box.isEmpty() ? null : (box.getCenter(new Vector3()).toArray() as Vec3)
      const radius = box.isEmpty() ? 0 : box.getSize(new Vector3()).length() / 2
      const { position, yaw } = startPlacement(center, radius)
      rig.position.fromArray(position)
      rig.rotation.set(0, yaw, 0)
    }
    // Närplanet i meter (sessionens enhet): 2 cm, så att man kan titta nära en fog.
    cam.near = 0.02
    cam.far = 200
    return () => {
      const t = useToolStore.getState()
      t.setHover(null)
      t.setHoverPoint(null)
      if (t.rulerHover) t.setRulerHover(null)
      // Vad kontrollerna rapporterade, så att man ser om knapparna hamnade rätt.
      const text = formatVrReport(report)
      if (text) useLibraryStore.getState().notify(text)
    }
  }, [gl, scene, report])

  useFrame((_state, delta, frame?: XRFrame) => {
    const xrCam = gl.xr.getCamera()
    const rig = xrCam.parent
    const ref = gl.xr.getReferenceSpace()
    if (!frame || !rig || !ref) return
    xrCam.getWorldPosition(tmp.head)
    tmp.euler.setFromQuaternion(xrCam.getWorldQuaternion(tmp.q))
    const headYaw = tmp.euler.y

    const sources = [...frame.session.inputSources].filter((s) => s.gamepad && s.targetRayMode === 'tracked-pointer')
    recordFrame(report, delta)
    for (const src of sources) recordSource(report, src.handedness, src.profiles, src.gamepad!)

    // Gå och vrid först, så att strålen räknas från där man står nu.
    for (const src of sources) {
      const axes = src.gamepad!.axes
      const x = axes[STICK_X] ?? 0
      const y = axes[STICK_Y] ?? 0
      const hand = handOf(hands, src.handedness)
      if (src.handedness === 'left') {
        // Högst 0,1 s per steg: efter ett hack i bildtakten hoppar man annars långt.
        const [dx, , dz] = walkStep(x, y, headYaw, Math.min(delta, 0.1))
        rig.position.x += dx
        rig.position.z += dz
      } else if (src.handedness === 'right') {
        // Greppknappen (långfingret) hålls in: världen sitter fast i handen (se grabRig).
        const squeezing = src.gamepad!.buttons[SQUEEZE]?.pressed ?? false
        const gripPose = squeezing ? frame.getPose(src.gripSpace ?? src.targetRaySpace, ref) : undefined
        if (gripPose) {
          const p = gripPose.transform.position
          tmp.euler.setFromQuaternion(tmp.q.set(...orientationOf(gripPose)))
          const now = { pos: [p.x, p.y, p.z] as Vec3, yaw: tmp.euler.y }
          if (!hand.grab) {
            rig.updateMatrixWorld()
            tmp.hand.set(p.x, p.y, p.z).applyMatrix4(rig.matrixWorld)
            hand.grab = { pos: tmp.hand.toArray() as Vec3, yaw: rig.rotation.y + now.yaw }
          }
          const next = grabRig(hand.grab, now, rig.scale.x)
          rig.position.fromArray(next.position)
          rig.rotation.set(0, next.yaw, 0)
        } else hand.grab = null
        // Ett ryck per gång spaken förs ut: nästa kräver att den varit i mitten.
        const out = Math.abs(x) > 0.6
        if (out && !hand.turned) {
          const angle = x > 0 ? -SNAP_TURN : SNAP_TURN
          rig.position.fromArray(turnAround(rig.position.toArray(), tmp.head.toArray(), angle))
          rig.rotation.y += angle
        }
        if (Math.abs(x) < DEAD_ZONE) hand.turned = false
        else if (out) hand.turned = true
      }
    }
    rig.updateMatrixWorld()

    // Menyn ovanför vänster kontroll, vänd mot ögonen (se menuMatrix).
    const menuHand = sources.find((s) => s.handedness === 'left')
    const menuPose = menuHand && frame.getPose(menuHand.gripSpace ?? menuHand.targetRaySpace, ref)
    if (menu.current) {
      menu.current.visible = !!menuPose
      if (menuPose) {
        tmp.m.fromArray(menuPose.transform.matrix).premultiply(rig.matrixWorld)
        tmp.hand.setFromMatrixPosition(tmp.m)
        xrCam.getWorldPosition(tmp.head)
        menuMatrix(tmp.hand, tmp.head, rig.scale.x, menu.current.matrix)
        menu.current.updateMatrixWorld(true)
      }
    }

    // Skyltarna bredvid kontrollerna, på utsidan av varje hand.
    for (const [handedness, legend, side] of [
      ['left', legendLeft, -1],
      ['right', legendRight, 1],
    ] as const) {
      const src = sources.find((s) => s.handedness === handedness)
      const pose = src && legendsOn.current ? frame.getPose(src.gripSpace ?? src.targetRaySpace, ref) : undefined
      if (!legend.current) continue
      legend.current.visible = !!pose
      if (pose) {
        tmp.m.fromArray(pose.transform.matrix).premultiply(rig.matrixWorld)
        tmp.hand.setFromMatrixPosition(tmp.m)
        legendMatrix(tmp.hand, tmp.head, rig.scale.x, side, legend.current.matrix)
        legend.current.updateMatrixWorld(true)
      }
    }

    let shown = false
    for (const src of sources) {
      const gp = src.gamepad!
      const hand = handOf(hands, src.handedness)
      const pressed = (i: number) => gp.buttons[i]?.pressed ?? false
      const edge = (i: number) => pressed(i) && !hand.buttons[i]
      const released = (i: number) => !pressed(i) && hand.buttons[i]

      if (edge(TRIGGER)) pointerHand.current = src.handedness
      if (edge(STICK_PRESS)) legendsOn.current = !legendsOn.current

      const pose = frame.getPose(src.targetRaySpace, ref)
      if (pose && src.handedness === pointerHand.current) {
        // Strålen i världen (mm): kontrollerns läge i sessionen, genom origo.
        tmp.m.fromArray(pose.transform.matrix).premultiply(rig.matrixWorld)
        tmp.m.decompose(tmp.pos, tmp.q, tmp.s)
        tmp.dir.copy(tmp.z).applyQuaternion(tmp.q).normalize()
        tmp.up.setFromMatrixColumn(xrCam.matrixWorld, 1).normalize()
        const ray: Ray = {
          origin: tmp.pos.toArray() as Vec3,
          dir: tmp.dir.toArray() as Vec3,
          up: tmp.up.toArray() as Vec3,
        }

        const tolAt = (p: Vec3) => tmp.head.distanceTo({ x: p[0], y: p[1], z: p[2] }) * TOL_RAD
        const tolForOp = () => {
          const { op } = useToolStore.getState()
          return op ? tolAt(opFocus(op)) : 0
        }
        const pick = (): Hit | null => {
          raycaster.set(tmp.pos, tmp.dir)
          const direct = closestObject(raycaster, pickTargets(scene))
          const floor = groundHit(ray)
          if (direct && (ON_TOP.has(direct.object.userData.pick.kind) || !floor || direct.distance <= floor.distance))
            return toHit(direct)
          return floor?.hit ?? null
        }

        // Menyn först: den ligger närmast, och det man trycker på där ska inte nå modellen.
        raycaster.set(tmp.pos, tmp.dir)
        const uiHit = menu.current?.visible ? raycaster.intersectObjects(uiTargets(menu.current), false)[0] : undefined
        const ui = uiHit?.object.userData.vrUi as VrUi | undefined
        const hovered = useVrHover.getState()
        if (hovered.id !== (ui?.id ?? null)) hovered.set(ui?.id ?? null)

        let hit: Hit | null = null
        const { op } = useToolStore.getState()
        if (hand.uiPress) {
          // Avtryckaren hålls nere efter ett tryck i menyn: inget med modellen förrän den släpps.
          if (!pressed(TRIGGER)) hand.uiPress = false
        } else if (ui) {
          // Pekar man på menyn står operationen kvar där den var, som när musen lämnar 3D-vyn.
          if (edge(TRIGGER)) {
            hand.uiPress = true
            runMenuAction(ui.action)
          }
        } else if (edge(TRIGGER)) {
          hit = onDown(ray, pick, tolAt, tolForOp, hand)
        } else if (released(TRIGGER)) {
          onUp(ray, tolForOp, hand)
        } else if (op) {
          move(ray, tolForOp())
        } else if (!pressed(TRIGGER)) {
          hit = pick()
          onHover(hit, tolAt)
        }

        if (edge(LOWER) || edge(UPPER)) {
          const docs = useDocumentStore.getState()
          if (useToolStore.getState().op) cancel()
          else if (edge(LOWER)) docs.undo()
          else docs.redo()
        }

        // Strålen och markören: till det man pekar på, annars en bit ut.
        const at = uiHit ? (uiHit.point.toArray() as Vec3) : (hit?.point ?? null)
        const length = at ? tmp.pos.distanceTo({ x: at[0], y: at[1], z: at[2] }) : RAY_MM
        if (beam.current && beamLine.current) {
          beam.current.position.copy(tmp.pos)
          beam.current.quaternion.copy(tmp.q)
          beamLine.current.scale.set(1, length, 1)
          beamLine.current.position.set(0, 0, -length / 2)
          shown = true
        }
        if (cursor.current) {
          cursor.current.visible = at !== null
          if (at) {
            cursor.current.position.fromArray(at)
            cursor.current.scale.setScalar(Math.max(4, length * 0.006))
          }
        }
      }

      hand.buttons = gp.buttons.map((b) => b.pressed)
    }
    if (beam.current) beam.current.visible = shown
    if (cursor.current && !shown) cursor.current.visible = false
  })

  return (
    <>
      <VrMenu group={menu} />
      <VrLegend group={legendLeft} text={LEGEND_LEFT} width={0.09} height={0.034} />
      <VrLegend group={legendRight} text={LEGEND_RIGHT} width={0.11} height={0.072} />
      {/* Strålen från handkontrollen (kontrollerna själva ritas av xrStore). Inte med på modellbilderna. */}
      <group ref={beam} userData={{ noThumb: true }} visible={false}>
        <mesh ref={beamLine} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.2, 1.2, 1, 8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      </group>
      <mesh ref={cursor} userData={{ noThumb: true }} visible={false}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial color="#ffffff" depthTest={false} transparent opacity={0.9} />
      </mesh>
    </>
  )
}

function handOf(hands: Map<XRHandedness, Hand>, h: XRHandedness) {
  let hand = hands.get(h)
  if (!hand) {
    hand = { buttons: [], press: null, turned: false, uiPress: false, lastTap: null, grab: null }
    hands.set(h, hand)
  }
  return hand
}

/**
 * Avtryckaren trycks ned. Pågår en operation tar den nytt tag (push/pull och
 * pilar) eller följer strålen; annars räknas trycket som ett tryck i 3D-vyn.
 */
function onDown(
  ray: Ray,
  pick: () => Hit | null,
  tolAt: (p: Vec3) => number,
  tolForOp: () => number,
  hand: Hand,
): Hit | null {
  const start = { dir: new Vector3(...ray.dir), origin: new Vector3(...ray.origin) }
  if (useToolStore.getState().op) {
    if (!regrab(ray)) move(ray, tolForOp())
    hand.press = { ...start, startedOp: false, afterTap: 'follow' }
    return null
  }
  const hit = pick()
  // I sprängskissen står delarna inte där de är: trycket väljer, inget annat.
  if (useViewStore.getState().exploded) {
    const t = hit?.target
    useDocumentStore.getState().select(t?.kind === 'body' ? { kind: 'body', id: t.id } : null)
    return hit
  }
  // Dubbeltryck på en del: Flytta/vrid, som i 3D-vyn. Första trycket har redan valt den.
  const t = hit?.target
  const now = performance.now()
  const again = t?.kind === 'body' && hand.lastTap?.id === t.id && now - hand.lastTap.time < DOUBLE_TAP_MS
  hand.lastTap = t?.kind === 'body' && !again ? { time: now, id: t.id } : null
  if (again && doubleTap(hit)) {
    hand.press = null
    return hit
  }
  tap(hit, hit ? tolAt(hit.point) : 0)
  const started = useToolStore.getState().op
  // Ett tryck på pilen utan dragning: i 3D-vyn väntar operationen på ett mått. I VR finns
  // ingen måttruta än, så den följer strålen i stället, och nästa tryck sparar.
  const after = started ? afterTapStart(hit?.target.kind ?? null, started) : 'follow'
  hand.press = { ...start, startedOp: started !== null, afterTap: after === 'wait' ? 'follow' : after }
  // Greppunkten från strålen, som dragningen (se ToolController).
  regrab(ray)
  return hit
}

/** Avtryckaren släpps: en dragning sparar operationen, ett tryck som startade den låter den följa strålen. */
function onUp(ray: Ray, tolForOp: () => number, hand: Hand) {
  const p = hand.press
  hand.press = null
  if (!p || !useToolStore.getState().op) return
  const turned = p.dir.angleTo(new Vector3(...ray.dir))
  const moved = p.origin.distanceTo(new Vector3(...ray.origin))
  const dragged = turned > DRAG_RAD || moved > DRAG_MM
  if (!dragged && p.startedOp) {
    if (p.afterTap === 'drop') cancel()
    return
  }
  move(ray, tolForOp())
  commit()
}

/** Strålen rör sig utan pågående operation: visa vad ett tryck skulle göra, som muspekaren. */
function onHover(hit: Hit | null, tolAt: (p: Vec3) => number) {
  const { tool, hover, setHover } = useToolStore.getState()
  if (useViewStore.getState().exploded) return
  if (tool === 'measure') {
    rulerHoverAt(hit, hit ? tolAt(hit.point) : 0)
    return
  }
  if (tool === 'rect' || tool === 'circle') {
    hoverAt(hit, hit ? tolAt(hit.point) : 0)
    return
  }
  if (tool === 'select') return
  const t = hit?.target
  const next =
    t?.kind === 'body' && t.face
      ? { kind: 'body' as const, id: t.id, face: t.face }
      : t?.kind === 'sketch' && tool === 'pushpull'
        ? t
        : null
  if (JSON.stringify(next) !== JSON.stringify(hover)) setHover(next)
}

/** Rotationen i en pose som [x, y, z, w]. */
function orientationOf(pose: XRPose): [number, number, number, number] {
  const o = pose.transform.orientation
  return [o.x, o.y, o.z, o.w]
}
