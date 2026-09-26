import { Color } from 'three'

/**
 * Khronos PBR Neutral, samma tonmappning som three.js NeutralToneMapping, på
 * linjära färger (0–1 och uppåt).
 */
export function neutral([r, g, b]: readonly number[]): [number, number, number] {
  const START = 0.8 - 0.04
  const DESATURATION = 0.15
  const x = Math.min(r!, g!, b!)
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04
  let c = [r! - offset, g! - offset, b! - offset]
  const peak = Math.max(...c)
  if (peak < START) return c as [number, number, number]
  const d = 1 - START
  const newPeak = 1 - (d * d) / (peak + d - START)
  c = c.map((v) => (v * newPeak) / peak)
  const t = 1 - 1 / (DESATURATION * (peak - newPeak) + 1)
  return c.map((v) => v + (newPeak - v) * t) as [number, number, number]
}

/**
 * Färgen som blir `hex` efter exponering och Neutral tonmappning. Bakgrunden
 * tonmappas i efterbehandlingen som resten av bilden; med den här färgen
 * blir den ändå den tänkta. Löses stegvis (tonmappningen går inte att vända direkt).
 */
export function beforeNeutral(hex: string, exposure: number): Color {
  const target = new Color(hex)
  const want = [target.r, target.g, target.b]
  const c = want.map((v) => v / exposure)
  for (let i = 0; i < 30; i++) {
    const got = neutral(c.map((v) => v * exposure))
    for (let k = 0; k < 3; k++) c[k] = Math.max(0, c[k]! + (want[k]! - got[k]!) / exposure)
  }
  return new Color(c[0]!, c[1]!, c[2]!)
}
