import { Matrix4, Quaternion, Vector3 } from 'three'

/** Så högt ovanför vänster kontroll menyns nederkant sitter, i meter. */
const LIFT_M = 0.04
const UP = new Vector3(0, 1, 0)
const rot = new Matrix4()
const at = new Vector3()
const q = new Quaternion()
const s = new Vector3()

/**
 * Menyns läge i världen (mm): nederkanten mitt ovanför vänster kontroll, och
 * framsidan (+Z) vänd mot ögonen, rak (ingen lutning åt sidan). Så går den att
 * läsa och peka på hur man än håller handen. scale är origos skala (MM_PER_M):
 * menyns egna mått är i meter.
 */
export function menuMatrix(hand: Vector3, head: Vector3, scale: number, target = new Matrix4()): Matrix4 {
  at.copy(hand).addScaledVector(UP, LIFT_M * scale)
  // lookAt ger en rotation där +Z pekar från at mot huvudet.
  rot.lookAt(head, at, UP)
  q.setFromRotationMatrix(rot)
  return target.compose(at, q, s.setScalar(scale))
}

/** Hur långt ut från handen skylten med knapparna sitter (legendMatrix), i meter. */
const LEGEND_SIDE_M = 0.095
const toHead = new Vector3()
const right = new Vector3()

/**
 * Skylten om vad knapparna gör: bredvid handen, på utsidan sett från ögonen
 * (side 1 till höger, -1 till vänster), mitt i höjd med den och vänd mot ögonen.
 */
export function legendMatrix(
  hand: Vector3,
  head: Vector3,
  scale: number,
  side: 1 | -1,
  target = new Matrix4(),
): Matrix4 {
  toHead.subVectors(head, hand).setY(0).normalize()
  // Åt höger sett från ögonen: upp × (mot ögonen).
  right.crossVectors(UP, toHead).normalize()
  at.copy(hand).addScaledVector(right, side * LEGEND_SIDE_M * scale)
  rot.lookAt(head, at, UP)
  q.setFromRotationMatrix(rot)
  return target.compose(at, q, s.setScalar(scale))
}
