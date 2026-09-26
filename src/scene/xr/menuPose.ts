import { Euler, Matrix4, Quaternion, Vector3 } from 'three'

const UP = new Vector3(0, 1, 0)
const rot = new Matrix4()
const at = new Vector3()
const q = new Quaternion()
const s = new Vector3()

/**
 * Menyns läge i vänster kontrolls strålriktning (targetRaySpace, i meter):
 * nederkanten 3 cm ovanför och 2 cm bakom där strålen börjar, och lutad 35°
 * bakåt mot en utöver kontrollens vinkel. Så ligger den vänd mot ögonen när man
 * håller handen avslappnat, lite nedåt framåt, och vrider man handen vrids
 * menyn med, som en palett (Tilt Brush, Quill). Strålens riktning och inte
 * greppet (gripSpace): greppets vinkel skiljer sig mellan kontroller, strålen
 * pekar alltid dit man siktar.
 */
export const MENU_OFFSET = new Matrix4().compose(
  new Vector3(0, 0.03, 0.02),
  new Quaternion().setFromEuler(new Euler(-0.6, 0, 0)),
  new Vector3(1, 1, 1),
)

/**
 * Menyns läge i världen (mm): kontrollens läge i världen (hand, med origos skala)
 * gånger MENU_OFFSET. Menyns egna mått är i meter, och skalan följer med från handen.
 */
export function menuMatrix(hand: Matrix4, target = new Matrix4()): Matrix4 {
  return target.multiplyMatrices(hand, MENU_OFFSET)
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
