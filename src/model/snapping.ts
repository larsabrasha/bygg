import { toLocal2D, toWorld } from './frame'
import type { Body, Frame, Vec2, Vec3 } from './types'
import { dot, sub } from './vec'

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

export interface PlaneTargets {
  xs: number[]
  ys: number[]
}

/** Andra kroppars nyckelpunkter projicerade på planet: linjer man kan snäppa i linje med. */
export function planeTargets(bodies: readonly Body[], frame: Frame, excludeId?: string): PlaneTargets {
  const xs: number[] = []
  const ys: number[] = []
  for (const b of bodies) {
    if (b.id === excludeId) continue
    for (const p of bodyKeyPoints(b)) {
      const [x, y] = toLocal2D(frame, p)
      xs.push(x)
      ys.push(y)
    }
  }
  return { xs, ys }
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
