import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { MathUtils, Vector3, type Group, type PerspectiveCamera } from 'three'
import { bodyCorners } from '../model/drawing'
import { explodeOffsets } from '../model/explode'
import type { Body, Vec3 } from '../model/types'
import { add, scale } from '../model/vec'
import { BodyMesh } from '../scene/BodyMesh'
import { RealisticLight } from '../scene/studio'
import { useColorScheme } from '../scene/useColorScheme'

/**
 * En möbel i studioljus på en vridskiva, som i en produktbild. Samma delar och
 * samma ljus som det realistiska utseendet i 3D-vyn. Går att snurra med fingret
 * eller musen (i sidled; uppåt och nedåt scrollar sidan som vanligt).
 */

/** Det sidan styr, läses varje bildruta: sprängning 0–1 och extra vridning i radianer. */
export interface StageControl {
  explode: number
  turn: number
}

interface Props {
  bodies: readonly Body[]
  control?: RefObject<StageControl>
  /** Hur långt isär delarna står vid explode = 1 (se explodeOffsets). 0 = aldrig isär. */
  explodeScale?: number
  /** Vridskivans fart, i radianer per sekund. */
  spin?: number
  /** Var i bilden möbeln står: förskjutning i andelar av bredd och höjd (positivt = höger, nedåt). */
  shift?: readonly [number, number]
  /** Hur stor möbeln är i bilden: 1 fyller den. */
  fill?: number
  /** Vinkeln man ser möbeln från vid start, i radianer runt den lodräta axeln. */
  angle?: number
  label: string
  className?: string
}

const FOV = 28
/** Kameran snett ovanifrån, som HOME i 3D-vyn men lite lägre. */
const VIEW = new Vector3(1, 0.62, 1.1).normalize()
const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

interface Bounds {
  center: Vector3
  radius: number
}

function boundsOf(corners: readonly Vec3[]): Bounds {
  const lo = [0, 1, 2].map((k) => Math.min(...corners.map((c) => c[k]!)))
  const hi = [0, 1, 2].map((k) => Math.max(...corners.map((c) => c[k]!)))
  return {
    center: new Vector3((lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2),
    radius: Math.hypot(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!) / 2,
  }
}

const moved = (b: Body, by: Vec3): Body => ({ ...b, frame: { ...b.frame, origin: add(b.frame.origin, by) } })

/** Vridskivan: snurrar av sig själv, går att dra i och fortsätter en stund när man släpper. */
class Turntable {
  angle: number
  private velocity = 0
  private held = false

  constructor(start: number) {
    this.angle = start
  }

  grab() {
    this.held = true
    this.velocity = 0
  }

  /** Vrider med fingret; senaste rörelsen blir farten när man släpper. */
  drag(turn: number, dt: number) {
    this.angle += turn
    this.velocity = MathUtils.lerp(this.velocity, turn / dt, 0.5)
  }

  release() {
    this.held = false
  }

  step(dt: number, spin: number) {
    if (this.held) return
    this.angle += this.velocity * dt
    this.velocity *= Math.exp(-2.5 * dt)
    if (!REDUCED) this.angle += spin * dt
  }
}

/** Sprängningen följer sidan mjukt, så att ett ryck i scrollen inte syns. */
class Smoothed {
  value = 0
  follow(target: number, dt: number) {
    this.value += (target - this.value) * (1 - Math.exp(-8 * dt))
    return this.value
  }
}

function Model({
  bodies,
  control,
  explodeScale,
  spin,
  shift,
  fill,
  table,
}: Required<Omit<Props, 'label' | 'className' | 'control' | 'angle'>> & {
  control?: RefObject<StageControl>
  table: Turntable
}) {
  const scheme = useColorScheme()

  const setup = useMemo(() => {
    const offsets = explodeOffsets(bodies, 1)
    const unit = bodies.map((b) => offsets.get(b.id) ?? ([0, 0, 0] as Vec3))
    const lowest = bodies.map((b) => Math.min(...bodyCorners(b).map((c) => c[1])))
    // Ljuset, skuggan och kameran ska räcka till delarna också när de står som längst isär
    // (och lyfts så att inget hamnar under golvet, som i useFrame nedan).
    const liftAt = (e: number) => Math.max(0, ...unit.map((u, i) => -(lowest[i]! + u[1] * e)))
    const top = liftAt(explodeScale)
    const apart =
      explodeScale > 0 ? bodies.map((b, i) => moved(b, add(scale(unit[i]!, explodeScale), [0, top, 0]))) : []
    const together = boundsOf(bodies.flatMap((b) => bodyCorners(b)))
    const spread = boundsOf([...bodies, ...apart].flatMap((b) => bodyCorners(b)))
    return { unit, liftAt, lit: [...bodies, ...apart], together, spread }
  }, [bodies, explodeScale])

  const parts = useRef<(Group | null)[]>([])
  const turntable = useRef<Group>(null)
  const [explode] = useState(() => new Smoothed())
  // Kontaktskuggan mörkar golvet under det som är nära det. Isär svävar delarna strax
  // över golvet och får då en suddig fläck under sig; den gäller bara hopsatt möbel.
  const [together, setTogether] = useState(true)
  const target = useMemo(() => new Vector3(), [])

  useFrame((frame, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const camera = frame.camera as PerspectiveCamera
    const { size } = frame
    const e = explode.follow((control?.current.explode ?? 0) * explodeScale, dt)
    if (e > 0.02 === together) setTogether(!together)
    // Delarna går isär från mitten; det som hamnar under golvet lyfts upp, så att allt står på golvet.
    const lift = setup.liftAt(e)
    setup.unit.forEach((u, i) => parts.current[i]?.position.set(u[0] * e, u[1] * e + lift, u[2] * e))

    // Vridskivan: av sig själv, med fingret, och med sidan.
    table.step(dt, spin)
    if (turntable.current) turntable.current.rotation.y = table.angle + (control?.current.turn ?? 0)

    // Kameran får plats med möbeln, också i en smal bild; längre bort när delarna står isär.
    const k = explodeScale > 0 ? e / explodeScale : 0
    const radius = MathUtils.lerp(setup.together.radius, setup.spread.radius, k)
    target.lerpVectors(setup.together.center, setup.spread.center, k)
    const aspect = size.width / Math.max(1, size.height)
    const half = Math.atan(Math.tan(MathUtils.degToRad(FOV / 2)) * Math.min(1, aspect))
    const distance = radius / Math.sin(half) / fill
    camera.position.copy(target).addScaledVector(VIEW, distance)
    camera.near = distance / 20
    camera.far = distance * 20
    camera.lookAt(target)
    camera.setViewOffset(
      size.width,
      size.height,
      -shift[0] * size.width,
      -shift[1] * size.height,
      size.width,
      size.height,
    )
  })

  const pivot = setup.together.center
  return (
    <>
      <RealisticLight bodies={setup.lit} scheme={scheme} contact={together} />
      <group position={[pivot.x, 0, pivot.z]}>
        <group ref={turntable}>
          <group position={[-pivot.x, 0, -pivot.z]}>
            {bodies.map((b, i) => (
              <group key={b.id} ref={(g) => void (parts.current[i] = g)}>
                <BodyMesh body={b} look="realistic" />
              </group>
            ))}
          </group>
        </group>
      </group>
    </>
  )
}

export function Stage({
  bodies,
  control,
  explodeScale = 0,
  spin = 0.12,
  shift = [0, 0],
  fill = 0.9,
  angle = 0,
  label,
  className = '',
}: Props) {
  const wrapper = useRef<HTMLDivElement>(null)
  const [table] = useState(() => new Turntable(angle))
  // Ritar bara när bilden syns: två scener på samma sida ska inte båda gå hela tiden.
  const [visible, setVisible] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = wrapper.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Snurra med fingret eller musen. Senaste rörelsen blir farten när man släpper.
  useEffect(() => {
    const el = wrapper.current
    if (!el) return
    let last: { x: number; t: number } | null = null
    const down = (e: PointerEvent) => {
      table.grab()
      last = { x: e.clientX, t: e.timeStamp }
    }
    const move = (e: PointerEvent) => {
      if (!last) return
      const dt = Math.max(1, e.timeStamp - last.t) / 1000
      table.drag(((e.clientX - last.x) / el.clientWidth) * Math.PI * 1.6, dt)
      last = { x: e.clientX, t: e.timeStamp }
    }
    const up = () => {
      last = null
      table.release()
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [table])

  return (
    <div
      ref={wrapper}
      role="img"
      aria-label={label}
      // pan-y: uppåt och nedåt scrollar sidan; i sidled snurrar möbeln.
      className={`cursor-grab touch-pan-y active:cursor-grabbing ${className}`}
    >
      <div className={`size-full transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`}>
        <Canvas
          shadows
          dpr={[1, 2]}
          frameloop={visible ? 'always' : 'never'}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          camera={{ fov: FOV, position: [3000, 2000, 3000] }}
          onCreated={() => setTimeout(() => setReady(true), 250)}
        >
          <Model
            bodies={bodies}
            control={control}
            explodeScale={explodeScale}
            spin={spin}
            shift={shift}
            fill={fill}
            table={table}
          />
        </Canvas>
      </div>
    </div>
  )
}
