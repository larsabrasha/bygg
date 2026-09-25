import type { Vec3 } from '../model/types'
import type { ViewImage } from '../store/printStore'

/** Något att skriva ut ett namn vid, i världen. */
export interface NamedPoint {
  name: string
  at: Vec3
}

type Capturer = (points: readonly NamedPoint[]) => ViewImage | null
let capturer: Capturer | null = null

/** 3D-vyn registrerar hur en bild av den tas (se ViewCapturer.tsx). */
export function setViewCapturer(fn: Capturer | null) {
  capturer = fn
}

/** Bild av 3D-vyn som den ser ut nu, utan rutnät och pilar, och var punkterna hamnar på den. */
export function captureView(points: readonly NamedPoint[]): ViewImage | null {
  try {
    return capturer?.(points) ?? null
  } catch (e) {
    console.warn('[bygg] Kunde inte ta bild av vyn', e)
    return null
  }
}
