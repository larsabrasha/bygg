import type { Vec3 } from './types'

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const neg = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]]
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])

/**
 * Parameter t för den punkt på linjen p + t·d som ligger närmast strålen o + s·r.
 * Null om linjen och strålen är nästan parallella (då går t inte att bestämma stabilt).
 * d och r antas vara enhetsvektorer.
 */
export function closestParamOnLine(p: Vec3, d: Vec3, o: Vec3, r: Vec3): number | null {
  const w = sub(p, o)
  const b = dot(d, r)
  const denom = 1 - b * b
  if (denom < 1e-4) return null
  return (b * dot(w, r) - dot(w, d)) / denom
}
