import type { Tool } from '../store/toolStore'
import type { PickTarget } from './actions'

/**
 * Regler för vem som får ett tryck, verktyget eller kameran, och hur
 * flerfingertryck tolkas. Ren logik utan DOM, så att den går att testa i node.
 */

export type PointerKind = 'mouse' | 'pen' | 'touch'

/** Hur långt pekaren får röra sig och ändå räknas som ett tryck, i px. */
export const TAP_SLOP: Record<PointerKind, number> = { mouse: 4, pen: 6, touch: 10 }
/** Längsta tid mellan två tryck som räknas som dubbeltryck, i ms. */
export const DOUBLE_TAP_MS = 350
/** Längsta tid för ett tryck med två eller tre fingrar (ångra/gör om), i ms. */
export const FINGER_TAP_MS = 300

export type Owner = 'tool' | 'camera'

/**
 * Vem som får ett nytt tryck. Verktyget får det när det kan börja något just
 * där, så att man drar ut en yta eller ritar direkt i stället för att vrida
 * kameran. Trycker man bredvid modellen vrider man kameran som vanligt.
 * target = vad som ligger under pekaren, null om inget (himlen).
 */
export function pressOwner(tool: Tool, opActive: boolean, kind: PointerKind, target: PickTarget['kind'] | null): Owner {
  if (opActive) return 'tool'
  switch (tool) {
    case 'select':
      return 'camera'
    // Med mus vrider vänsterknappen kameran även här; man ritar med två klick.
    // Med finger eller penna ritar man genom att dra från hörn till hörn.
    case 'rect':
      return kind !== 'mouse' && target !== null ? 'tool' : 'camera'
    case 'pushpull':
      return target === 'sketch' || target === 'body' ? 'tool' : 'camera'
    case 'move':
      return target === 'body' ? 'tool' : 'camera'
  }
}

export type CameraAction = 'none' | 'rotate' | 'dolly' | 'truck' | 'dollyTruck' | 'dollyRotate'

export interface CameraButtons {
  left: CameraAction
  middle: CameraAction
  right: CameraAction
  one: CameraAction
  two: CameraAction
  three: CameraAction
}

/**
 * Vad musknappar och fingrar gör med kameran under ett tryck.
 * När verktyget äger trycket gör vänsterknappen och ett finger inget med
 * kameran; då vrider mittknappen (som i SketchUp). I Välj-läget panorerar två
 * fingrar; i verktygslägena, där ett finger ofta tillhör verktyget, vrider de.
 * Tre fingrar panorerar alltid.
 */
export function cameraButtons(tool: Tool, owner: Owner): CameraButtons {
  const toolOwns = owner === 'tool'
  return {
    left: toolOwns ? 'none' : 'rotate',
    middle: toolOwns ? 'rotate' : 'dolly',
    right: 'truck',
    one: toolOwns ? 'none' : 'rotate',
    two: tool === 'select' ? 'dollyTruck' : 'dollyRotate',
    three: 'truck',
  }
}

export interface TapPoint {
  x: number
  y: number
  time: number
}

/** Om b kommer tätt efter a och nära samma ställe. */
export function isDoubleTap(a: TapPoint | null, b: TapPoint, slop: number): boolean {
  return !!a && b.time - a.time <= DOUBLE_TAP_MS && Math.hypot(b.x - a.x, b.y - a.y) <= slop * 2
}

/**
 * Tryck med flera fingrar samtidigt: två fingrar ångrar, tre gör om (som i
 * Shapr3D). Räknas bara om alla fingrar släpptes snabbt och nästan stod still.
 */
export function fingerTap(fingers: number, durationMs: number, maxMovedPx: number): 'undo' | 'redo' | null {
  if (durationMs > FINGER_TAP_MS || maxMovedPx > TAP_SLOP.touch) return null
  if (fingers === 2) return 'undo'
  if (fingers === 3) return 'redo'
  return null
}
