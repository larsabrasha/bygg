import { toWorld } from './frame'
import type { Body, Vec3 } from './types'
import { add } from './vec'

/** Delens åtta hörn i världen (en cylinder räknas som sin låda), flyttad offset i sprängskissen. */
export function bodyCorners(b: Body, offset: Vec3 = [0, 0, 0]): Vec3[] {
  const { x0, x1, y0, y1 } = b.profile
  const out: Vec3[] = []
  for (const x of [x0, x1]) {
    for (const y of [y0, y1]) {
      for (const z of [b.z0, b.z1]) out.push(add(toWorld(b.frame, [x, y, z]), offset))
    }
  }
  return out
}

/** Hela modellens yttermått i världen: bredd (x), djup (z) och höjd (y). Verktyg räknas inte. */
export function overallSize(bodies: readonly Body[]): { width: number; depth: number; height: number } | null {
  const corners = bodies.filter((b) => !b.tool).flatMap((b) => bodyCorners(b))
  if (corners.length === 0) return null
  const span = (k: number) => Math.max(...corners.map((c) => c[k]!)) - Math.min(...corners.map((c) => c[k]!))
  return { width: span(0), depth: span(2), height: span(1) }
}

/** Ballongens radie: följer bildens bredd, men blir inte för liten att läsa på en telefon. */
export const balloonRadius = (width: number) => Math.max(11, width * 0.018)

/** Var en positionsballong pekar, i bildens pixlar (y nedåt). */
export interface Anchor {
  pos: number
  x: number
  y: number
}

/** En punkt i ett rutnät över delens bild; seen = delen är det första man träffar där. */
export interface Sample {
  x: number
  y: number
  seen: boolean
}

/**
 * Var ballongens linje ska peka: en punkt där delen syns, inte en annan del
 * framför den. Helst en punkt vars grannar också syns (en bit in från kanten
 * av det synliga), och av dem den närmast mitten av det synliga.
 * Rutnätet är rader av punkter; seen är hur många punkter som syns.
 */
export function anchorPoint(grid: readonly (readonly Sample[])[]): { x: number; y: number; seen: number } | null {
  const seen = grid.flat().filter((p) => p.seen)
  if (seen.length === 0) return null
  const cx = seen.reduce((sum, p) => sum + p.x, 0) / seen.length
  const cy = seen.reduce((sum, p) => sum + p.y, 0) / seen.length
  const isSeen = (i: number, j: number) => grid[i]?.[j]?.seen ?? false
  const inner = grid.flatMap((row, i) =>
    row.filter((p, j) => p.seen && isSeen(i - 1, j) && isSeen(i + 1, j) && isSeen(i, j - 1) && isSeen(i, j + 1)),
  )
  const candidates = inner.length > 0 ? inner : seen
  const best = candidates.reduce((a, b) => (Math.hypot(b.x - cx, b.y - cy) < Math.hypot(a.x - cx, a.y - cy) ? b : a))
  return { x: best.x, y: best.y, seen: seen.length }
}

/** Ballongens mitt (bx, by) och punkten på delen den pekar på (x, y). */
export interface Balloon extends Anchor {
  bx: number
  by: number
}

/** Lådan runt det ritade i bilden, i pixlar. */
export interface PixelBox {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * Ballongerna står i en kolumn på var sida om det ritade, som på en
 * sammanställningsritning. En del till vänster om mitten får sin ballong till
 * vänster. I kolumnen står de i samma ordning uppifrån som delarna, så att
 * linjerna inte korsar varandra, och flyttas isär tills de inte överlappar.
 */
export function layoutBalloons(
  anchors: readonly Anchor[],
  content: PixelBox,
  area: { width: number; height: number },
  r: number,
): Balloon[] {
  const gap = r * 0.5
  const step = 2 * r + gap
  const mid = (content.left + content.right) / 2
  const top = r + gap
  const bottom = area.height - r - gap
  const columnX = {
    left: Math.max(r + gap, content.left - 2.5 * r),
    right: Math.min(area.width - r - gap, content.right + 2.5 * r),
  }

  const out: Balloon[] = []
  for (const side of ['left', 'right'] as const) {
    const list = anchors.filter((a) => (side === 'left' ? a.x < mid : a.x >= mid)).sort((a, b) => a.y - b.y)
    if (list.length === 0) continue
    const ys = spread(
      list.map((a) => a.y),
      top,
      bottom,
      step,
    )
    list.forEach((a, i) => out.push({ ...a, bx: columnX[side], by: ys[i]! }))
  }
  return out.sort((a, b) => a.pos - b.pos)
}

/**
 * Önskade lägen (sorterade) flyttade så att de står minst step isär mellan lo och hi.
 * Ryms de inte står de jämnt fördelade.
 */
export function spread(wanted: readonly number[], lo: number, hi: number, step: number): number[] {
  const n = wanted.length
  if (n === 0) return []
  if (n > 1 && (n - 1) * step > hi - lo) return wanted.map((_, i) => lo + ((hi - lo) * i) / (n - 1))
  const ys = wanted.map((y) => Math.min(hi, Math.max(lo, y)))
  for (let i = 1; i < n; i++) ys[i] = Math.max(ys[i]!, ys[i - 1]! + step)
  ys[n - 1] = Math.min(ys[n - 1]!, hi)
  for (let i = n - 2; i >= 0; i--) ys[i] = Math.min(ys[i]!, ys[i + 1]! - step)
  return ys
}
