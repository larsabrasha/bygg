import { AREA, dimRows, GAP, ONE_ROW, PAD, SCALES, type SheetDim } from './partSheet'
import type { Vec3 } from './types'

/**
 * Huvudvyer: hela modellen framifrån, från vänster och ovanifrån, med
 * yttermåtten. Samma blad och skalor som detaljbladen (partSheet), i mm på papperet.
 */

export type MainView = 'front' | 'side' | 'top'

/** Riktningen kameran står åt från modellen, och vad som är uppåt i bilden. */
export const MAIN_VIEW_CAMERA: Record<MainView, { dir: Vec3; up: Vec3 }> = {
  // Framifrån: världens z pekar mot betraktaren.
  front: { dir: [0, 0, 1], up: [0, 1, 0] },
  // E-metoden: vyn till höger om framvyn är modellen sedd från vänster; framsidan hamnar till höger.
  side: { dir: [-1, 0, 0], up: [0, 1, 0] },
  // E-metoden: vyn under framvyn är modellen sedd ovanifrån; framsidan hamnar nedåt.
  top: { dir: [0, 1, 0], up: [0, 0, -1] },
}

/** Där en vy står på papperet: bildens ruta, med marginal runt modellen. */
export interface ViewRect {
  x: number
  y: number
  w: number
  h: number
}

export interface MainViewsLayout {
  scale: number
  /** Luft runt modellen i bilden, i mm på papperet (kanterna ska inte klippas). */
  margin: number
  views: Record<MainView, ViewRect>
  dims: SheetDim[]
}

const MARGIN = 2

/**
 * Vyerna enligt E-metoden: framvyn uppe till vänster, sidovyn till höger om den
 * och vyn ovanifrån under den, i samma skala och i linje med varandra. Bredd
 * och höjd måttsätts vid framvyn, djupet vid sidovyn.
 */
export function layoutMainViews(size: { width: number; depth: number; height: number }): MainViewsLayout {
  const { width: W, depth: D, height: H } = size
  const top = ONE_ROW
  const left = ONE_ROW
  const fits = (s: number) =>
    left + W / s + GAP + D / s <= AREA.w - 2 * PAD && top + H / s + GAP + D / s <= AREA.h - 2 * PAD
  const s = SCALES.find(fits) ?? SCALES.at(-1)!

  const total = { w: left + W / s + GAP + D / s, h: top + H / s + GAP + D / s }
  const x = AREA.x + (AREA.w - total.w) / 2 + left
  const y = AREA.y + (AREA.h - total.h) / 2 + top
  const sideX = x + W / s + GAP
  const topY = y + H / s + GAP

  const rect = (cx: number, cy: number, w: number, h: number): ViewRect => ({
    x: cx - MARGIN,
    y: cy - MARGIN,
    w: w / s + 2 * MARGIN,
    h: h / s + 2 * MARGIN,
  })

  return {
    scale: s,
    margin: MARGIN,
    views: { front: rect(x, y, W, H), side: rect(sideX, y, D, H), top: rect(x, topY, W, D) },
    dims: [
      ...dimRows([0, W], false, (v) => x + v / s, y, 'horizontal'),
      ...dimRows([0, H], false, (v) => y + H / s - v / s, x, 'vertical'),
      ...dimRows([0, D], false, (v) => sideX + v / s, y, 'horizontal'),
    ],
  }
}
