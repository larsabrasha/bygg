import { Vector3, type ArrayCamera } from 'three'

const posL = new Vector3()
const posR = new Vector3()
const col = new Vector3()

/**
 * Rättar XR-kameran som three.js gallrar med (frustum culling) när origo är
 * skalat (se MM_PER_M). Körs efter att three räknat den och före gallringen.
 *
 * Två fel gör annars att allt gallras bort:
 * - Camera.updateMatrixWorld tar bort skalan ur matrixWorldInverse, så vyn
 *   blir i mm medan projektionen är i meter (sessionens enhet).
 * - Den gemensamma projektionen för båda ögonen (setProjectionFromUnion i
 *   WebXRManager) räknar ögonavståndet i världens enhet (mm) men när- och
 *   fjärrplanet i meter, och flyttar närplanet tiotals meter bort.
 *
 * Kamerans läge (matrixWorld) är rätt: den flyttas i världens enhet. Här
 * räknas inversen och projektionen om som three gör, men med ögonavståndet i meter.
 */
export function fixScaledXrCamera(camera: ArrayCamera) {
  const scale = col.setFromMatrixColumn(camera.matrixWorld, 0).length()
  if (Math.abs(scale - 1) < 1e-9) return
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert()

  const [left, right] = camera.cameras
  if (!left || !right) return
  const projL = left.projectionMatrix.elements
  const projR = right.projectionMatrix.elements
  // Oändligt fjärrplan: three använder vänster ögas projektion, och den är i meter som den ska.
  if (projL[10] === -1) return

  posL.setFromMatrixPosition(left.matrixWorld)
  posR.setFromMatrixPosition(right.matrixWorld)
  const ipd = posL.distanceTo(posR) / scale

  const near = projL[14]! / (projL[10]! - 1)
  const far = projL[14]! / (projL[10]! + 1)
  const topFov = (projL[9]! + 1) / projL[5]!
  const bottomFov = (projL[9]! - 1) / projL[5]!
  const leftFov = (projL[8]! - 1) / projL[0]!
  const rightFov = (projR[8]! + 1) / projR[0]!

  const zOffset = ipd / (-leftFov + rightFov)
  const xOffset = zOffset * -leftFov
  const near2 = near + zOffset
  const far2 = far + zOffset
  const left2 = near * leftFov - xOffset
  const right2 = near * rightFov + (ipd - xOffset)
  const top2 = ((topFov * far) / far2) * near2
  const bottom2 = ((bottomFov * far) / far2) * near2
  camera.projectionMatrix.makePerspective(left2, right2, top2, bottom2, near2, far2)
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
}
