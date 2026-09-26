import { describe, expect, it } from 'vitest'
import { ArrayCamera, Frustum, Group, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { fixScaledXrCamera } from './xrCulling'

/** Ögonavstånd i meter, som i ett headset. */
const IPD = 0.063

/**
 * Ett headset med två ögon (90° synfält, när 2 cm, fjärr 200 m, i meter) under
 * ett origo skalat 1000 gånger, och XR-kameran som three.js räknar fram
 * (setProjectionFromUnion): läget flyttat i världens enhet, projektionen med
 * ögonavståndet i världens enhet, och inversen utan skala (Camera.updateMatrixWorld).
 */
function scaledHeadset(): ArrayCamera {
  const rig = new Group()
  rig.position.set(180, 0, 1680)
  rig.scale.setScalar(1000)
  rig.updateMatrixWorld(true)

  const eye = (x: number) => {
    const c = new PerspectiveCamera()
    c.projectionMatrix.makePerspective(-0.02, 0.02, 0.02, -0.02, 0.02, 200)
    c.matrixWorld.multiplyMatrices(rig.matrixWorld, new Matrix4().makeTranslation(x, 1.6, 0))
    return c
  }
  const left = eye(-IPD / 2)
  const right = eye(IPD / 2)
  const xr = new ArrayCamera([left, right])

  // Som three: ögonavståndet i mm (världens enhet) blandat med när och fjärr i meter.
  const ipdWorld = IPD * 1000
  const zOffset = ipdWorld / 2
  left.matrixWorld.decompose(xr.position, xr.quaternion, xr.scale)
  xr.translateX(zOffset)
  xr.translateZ(zOffset)
  xr.matrixWorld.compose(xr.position, xr.quaternion, xr.scale)
  xr.projectionMatrix.makePerspective(
    -0.02 - zOffset,
    0.02 + ipdWorld - zOffset,
    0.02 + zOffset,
    -0.02 - zOffset,
    0.02 + zOffset,
    200 + zOffset,
  )
  xr.matrixWorldInverse.compose(xr.position, xr.quaternion, new Vector3(1, 1, 1)).invert()
  return xr
}

const frustumOf = (c: ArrayCamera) =>
  new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse))

describe('fixScaledXrCamera', () => {
  it('three.js egen XR-kamera gallrar bort det man har framför sig', () => {
    expect(frustumOf(scaledHeadset()).containsPoint(new Vector3(180, 450, 180))).toBe(false)
  })

  it('efter rättningen syns en pall 1,5 m framför och nedanför', () => {
    const xr = scaledHeadset()
    fixScaledXrCamera(xr)
    const f = frustumOf(xr)
    expect(f.containsPoint(new Vector3(180, 450, 180))).toBe(true)
    // Nära, en fog en dryg decimeter framför ögonen.
    expect(f.containsPoint(new Vector3(180, 1600, 1540))).toBe(true)
  })

  it('rymmer det båda ögonen ser, men inte det bakom huvudet', () => {
    const xr = scaledHeadset()
    fixScaledXrCamera(xr)
    const f = frustumOf(xr)
    // Vänster ögas vänstra kant och höger ögas högra, 2 m bort (45° åt sidan).
    expect(f.containsPoint(new Vector3(180 - 31.5 - 1990, 1600, 1680 - 2000))).toBe(true)
    expect(f.containsPoint(new Vector3(180 + 31.5 + 1990, 1600, 1680 - 2000))).toBe(true)
    expect(f.containsPoint(new Vector3(180, 1600, 1680 + 500))).toBe(false)
    expect(f.containsPoint(new Vector3(180, 1600, 1680 - 250_000))).toBe(false)
  })

  it('lämnar en oskalad kamera som den är', () => {
    const xr = new ArrayCamera([new PerspectiveCamera(), new PerspectiveCamera()])
    xr.projectionMatrix.makePerspective(-1, 1, 1, -1, 1, 10)
    const before = xr.projectionMatrix.clone()
    fixScaledXrCamera(xr)
    expect(xr.projectionMatrix.equals(before)).toBe(true)
  })
})
