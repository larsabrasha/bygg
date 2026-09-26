import { toLocal2D, toWorld } from './frame'
import type { Body, Frame, Rect, Vec2, Vec3 } from './types'
import { add, dot, sub } from './vec'

/** Kroppens hörn och kantmittpunkter i världskoordinater. */
export function bodyKeyPoints(body: Body): Vec3[] {
  const { x0, x1, y0, y1 } = body.profile
  const xs = [x0, (x0 + x1) / 2, x1]
  const ys = [y0, (y0 + y1) / 2, y1]
  const zs = [body.z0, (body.z0 + body.z1) / 2, body.z1]
  const out: Vec3[] = []
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) {
        // Hörn (inga mitt-index) och kantmitt (exakt ett mitt-index). Inte ytmitt eller centrum.
        const mids = Number(i === 1) + Number(j === 1) + Number(k === 1)
        if (mids <= 1) out.push(toWorld(body.frame, [xs[i]!, ys[j]!, zs[k]!]))
      }
  return out
}

/** En punkt som ett mål kommer från: i planet, och där den sitter i världen. */
export interface TargetPoint {
  at: Vec2
  world: Vec3
}

export interface PlaneTargets {
  xs: number[]
  ys: number[]
  /** Punkterna målen kommer från: hjälplinjerna dras från dem (se guideLines). */
  points?: TargetPoint[]
}

/** Andra kroppars nyckelpunkter projicerade på planet: linjer man kan snäppa i linje med. */
export function planeTargets(bodies: readonly Body[], frame: Frame, excludeId?: string): PlaneTargets {
  const xs: number[] = []
  const ys: number[] = []
  const points: TargetPoint[] = []
  for (const b of bodies) {
    if (b.id === excludeId) continue
    for (const world of bodyKeyPoints(b)) {
      const at = toLocal2D(frame, world)
      xs.push(at[0])
      ys.push(at[1])
      points.push({ at, world })
    }
  }
  return { xs, ys, points }
}

/** Så nära (mm) en målpunkt ska ligga i linje för att räknas. */
const ALIGNED = 1e-6

/**
 * Hjälplinjer, i världen, som visar vad något snäppte i linje med. moving är
 * punkterna som flyttas (efter flytten, i planet och i världen). Per axel som
 * snäppte: från den närmaste målpunkten som en av dem ligger i linje med, fram
 * till den. Ingen linje om de sitter på samma ställe (då räcker markören).
 */
export function alignedGuides(
  moving: readonly TargetPoint[],
  targets: PlaneTargets,
  onTarget: readonly [boolean, boolean],
): [Vec3, Vec3][] {
  const out: [Vec3, Vec3][] = []
  for (const i of [0, 1] as const) {
    if (!onTarget[i]) continue
    let best: [Vec3, Vec3] | null = null
    let bestDist = Infinity
    for (const m of moving)
      for (const t of targets.points ?? []) {
        if (Math.abs(t.at[i] - m.at[i]) > ALIGNED) continue
        const dist = Math.hypot(...sub(t.world, m.world))
        if (dist > ALIGNED && dist < bestDist) {
          best = [t.world, m.world]
          bestDist = dist
        }
      }
    if (best) out.push(best)
  }
  return out
}

/** Nyckelpunkterna at (i planet) och world efter en flytt delta i planet, deltaWorld i världen. */
export function movedPoints(at: readonly Vec2[], world: readonly Vec3[], delta: Vec2, deltaWorld: Vec3): TargetPoint[] {
  return at.map((p, i) => ({ at: [p[0] + delta[0], p[1] + delta[1]], world: add(world[i]!, deltaWorld) }))
}

/** Hjälplinjer till punkten p i planet frame (se alignedGuides). */
export function guideLines(
  frame: Frame,
  p: Vec2,
  targets: PlaneTargets,
  onTarget: readonly [boolean, boolean],
): [Vec3, Vec3][] {
  return alignedGuides([{ at: p, world: toWorld(frame, [p[0], p[1], 0]) }], targets, onTarget)
}

/** Kantmittpunkterna och mitten på en rektangel: punkter man kan snäppa till. */
export function rectMidpoints({ x0, y0, x1, y1 }: Rect): Vec2[] {
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2]
  return [
    [cx, y0],
    [cx, y1],
    [x0, cy],
    [x1, cy],
    [cx, cy],
  ]
}

/** Avstånd längs normalen från point till varje nyckelpunkt: lägen där en yta hamnar i jämnhöjd. */
export function offsetTargets(bodies: readonly Body[], point: Vec3, normal: Vec3): number[] {
  return bodies.flatMap((b) => bodyKeyPoints(b).map((p) => dot(sub(p, point), normal)))
}

export interface SnapResult {
  value: number
  /** Sant om värdet snäppte till ett mål (inte bara till rutnätet). */
  onTarget: boolean
}

/** Närmaste mål inom tol, annars rutnätet step. */
export function snapValue(value: number, step: number, targets: readonly number[], tol: number): SnapResult {
  let best: number | null = null
  for (const t of targets) {
    if (Math.abs(t - value) <= tol && (best === null || Math.abs(t - value) < Math.abs(best - value))) best = t
  }
  return best === null ? { value: Math.round(value / step) * step, onTarget: false } : { value: best, onTarget: true }
}

/**
 * Snäpper en förflyttning i ett plan: någon av de flyttade punkterna ska hamna
 * i linje med ett mål, per axel. Utan träff avrundas till step.
 */
export function snapDelta(
  delta: Vec2,
  moving: readonly Vec2[],
  targets: PlaneTargets,
  step: number,
  tol: number,
): { delta: Vec2; onTarget: [boolean, boolean] } {
  const axis = (i: 0 | 1, ts: readonly number[]): SnapResult => {
    // Kandidater: förflyttningar som lägger en flyttad punkt exakt på ett mål.
    const candidates = moving.flatMap((m) => ts.map((t) => t - m[i]))
    return snapValue(delta[i], step, candidates, tol)
  }
  const x = axis(0, targets.xs)
  const y = axis(1, targets.ys)
  return { delta: [x.value, y.value], onTarget: [x.onTarget, y.onTarget] }
}
