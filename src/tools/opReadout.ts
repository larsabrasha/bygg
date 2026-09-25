import { toWorld } from '../model/frame'
import { numberFormat } from '../model/numberFormat'
import type { Vec3 } from '../model/types'
import { add, scale } from '../model/vec'
import type { Op } from '../store/toolStore'
import { moveDeltaWorld } from './actions'

const delta = numberFormat(1, false, true)
const plain = numberFormat(1)

/**
 * Värdet som ändras under en operation och var det ska visas i 3D: vid
 * pilspetsen (push/pull), vid det flyttade (flytta) eller vid ekern man vrider
 * (vrida), eller diametern vid pekaren (cirkel). Där tittar man medan man drar.
 * Null när inget har ändrats än, eller för en rektangel.
 * arrowLength = pilens längd i mm, så att värdet hamnar vid spetsen och inte vid ytan.
 */
export function opReadout(op: Op, arrowLength: number): { at: Vec3; text: string } | null {
  if (op.kind === 'pushpull') {
    if (op.distance === 0) return null
    const at = add(op.anchor, scale(op.normal, op.distance + arrowLength))
    return { at, text: `${delta.format(op.distance)} mm` }
  }
  if (op.kind === 'move') {
    const [du, dv] = op.delta
    if (du === 0 && dv === 0) return null
    const at = add(op.plane.origin, moveDeltaWorld(op))
    // Längs en pil har värdet ett tecken; fritt i planet är det bara hur långt.
    const text = op.axis !== null ? delta.format(du) : plain.format(Math.hypot(du, dv))
    return { at, text: `${text} mm` }
  }
  // En cirkel har inga kanter att visa måtten på, så diametern visas vid pekaren.
  if (op.kind === 'rect' && op.shape === 'circle') {
    const d = 2 * Math.hypot(op.current[0] - op.first[0], op.current[1] - op.first[1])
    if (d === 0) return null
    return { at: toWorld(op.frame, [op.current[0], op.current[1], 0]), text: `Ø ${plain.format(d)} mm` }
  }
  if (op.kind === 'rotate') {
    if (op.angle === 0) return null
    const a = ((op.grab + op.angle) * Math.PI) / 180
    const at = toWorld(op.plane, [op.radius * Math.cos(a), op.radius * Math.sin(a), 0])
    return { at, text: `${delta.format(op.angle)}°` }
  }
  return null
}
