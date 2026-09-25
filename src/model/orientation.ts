import { toLocal } from './frame'
import type { Frame, Orientation, Vec3 } from './types'
import { add, cross, scale, sub } from './vec'

/**
 * Vinklar för en kopia, som i detaljpanelen: vridning runt världens X, Y och Z
 * i grader, räknat från delens viloläge (hur den låg innan den vreds första
 * gången). Ordningen är först X, sedan Y, sist Z, runt världens fasta axlar.
 */
export type Angles = [number, number, number]

type Mat3 = [Vec3, Vec3, Vec3] // rader

const DEG = Math.PI / 180

/** Tar bort flyttalsbrus, så att 90° ger exakt 0 och 1. */
const clean = (x: number, step: number) => {
  const r = Math.round(x / step) * step
  return (Math.abs(x - r) < 1e-9 ? r : x) + 0 // + 0 gör −0 till 0
}

/** Närmaste läge längs världens axlar: varje axel avrundad till en världsaxel, högerhänt. */
export function snapAxes(f: Orientation): Orientation {
  const nearest = (a: Vec3, not?: number): [Vec3, number] => {
    let best = -1
    for (let i = 0; i < 3; i++) if (i !== not && (best < 0 || Math.abs(a[i]!) > Math.abs(a[best]!))) best = i
    const out: Vec3 = [0, 0, 0]
    out[best] = a[best]! < 0 ? -1 : 1
    return [out, best]
  }
  const [u, iu] = nearest(f.u)
  const [v] = nearest(f.v, iu)
  return { u, v, n: cross(u, v).map((x) => x + 0) as Vec3 }
}

/** Viloläget för en kopia; saknas det har den aldrig vridits snett och ligger längs världens axlar. */
export const restOf = (inst: { frame: Frame; rest?: Orientation }): Orientation => inst.rest ?? snapAxes(inst.frame)

/** Vridningen som tar vilolägets axlar till framens: R = F · Rᵀ. */
function rotationBetween(rest: Orientation, f: Orientation): Mat3 {
  const row = (i: number): Vec3 =>
    [0, 1, 2].map((j) => f.u[i]! * rest.u[j]! + f.v[i]! * rest.v[j]! + f.n[i]! * rest.n[j]!) as Vec3
  return [row(0), row(1), row(2)]
}

/** R = Rz · Ry · Rx. */
function fromAngles([x, y, z]: Angles): Mat3 {
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(x * DEG),
    Math.sin(x * DEG),
    Math.cos(y * DEG),
    Math.sin(y * DEG),
    Math.cos(z * DEG),
    Math.sin(z * DEG),
  ]
  return [
    [cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz],
    [cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz],
    [-sy, sx * cy, cx * cy],
  ]
}

const apply = (m: Mat3, a: Vec3): Vec3 => m.map((r) => clean(r[0] * a[0] + r[1] * a[1] + r[2] * a[2], 1)) as Vec3

/** Vinklarna för en frame räknat från viloläget. Vid Y = ±90° (kardanlås) sätts Z till 0. */
export function anglesOf(f: Orientation, rest: Orientation): Angles {
  const r = rotationBetween(rest, f)
  const sy = -r[2][0]
  if (Math.abs(sy) > 1 - 1e-9) {
    const x = Math.atan2(-r[1][2], r[1][1])
    return [clean(x / DEG, 1e-6), sy > 0 ? 90 : -90, 0]
  }
  const toDeg = (a: number) => clean(a / DEG, 1e-6)
  return [toDeg(Math.atan2(r[2][1], r[2][2])), toDeg(Math.asin(sy)), toDeg(Math.atan2(r[1][0], r[0][0]))]
}

/**
 * Framen med nya vinklar, vriden runt center (en punkt som ska stå still,
 * t.ex. delens mitt).
 */
export function withAngles(f: Frame, rest: Orientation, center: Vec3, angles: Angles): Frame {
  const m = fromAngles(angles)
  const u = apply(m, rest.u)
  const v = apply(m, rest.v)
  const n = apply(m, rest.n)
  const [cx, cy, cz] = toLocal(f, center)
  const origin = sub(center, add(add(scale(u, cx), scale(v, cy)), scale(n, cz))).map((x) => clean(x, 1e-6)) as Vec3
  return { origin, u, v, n }
}
