import { describe, expect, it } from 'vitest'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { legendMatrix, menuMatrix } from './menuPose'

describe('menuMatrix', () => {
  // Kontrollen i världen: vid handen, skalad som origo, och vriden på något sätt.
  const grip = new Matrix4().compose(
    new Vector3(-250, 1100, 1300),
    new Quaternion().setFromEuler(new Euler(0.4, -0.7, 0.2)),
    new Vector3(1000, 1000, 1000),
  )
  const m = menuMatrix(grip)
  const pos = new Vector3().setFromMatrixPosition(m)

  it('nederkanten 3 cm ovanför och 2 cm bakom strålens start, i kontrollens riktningar', () => {
    const up = new Vector3().setFromMatrixColumn(grip, 1).normalize()
    const back = new Vector3().setFromMatrixColumn(grip, 2).normalize()
    const expected = new Vector3(-250, 1100, 1300).addScaledVector(up, 30).addScaledVector(back, 20)
    expect(pos.distanceTo(expected)).toBeCloseTo(0, 6)
  })
  it('följer handen: vrids greppet, vrids menyn lika mycket', () => {
    const turn = new Matrix4().makeRotationY(0.5)
    const turned = menuMatrix(turn.clone().multiply(grip))
    const z = (x: Matrix4) => new Vector3().setFromMatrixColumn(x, 2).normalize()
    expect(z(turned).distanceTo(z(m).applyMatrix4(turn))).toBeCloseTo(0, 6)
  })
  it('lutad 35° bakåt mot en utöver kontrollens vinkel', () => {
    const z = new Vector3().setFromMatrixColumn(menuMatrix(new Matrix4()), 2)
    expect(Math.atan2(z.y, z.z)).toBeCloseTo(0.6, 9)
    expect(z.x).toBeCloseTo(0, 9)
  })
  it('skalad som origo, så att menyns mått i meter blir mm i världen', () => {
    expect(new Vector3().setFromMatrixColumn(m, 1).length()).toBeCloseTo(1000, 6)
  })
})

describe('legendMatrix', () => {
  const hand = new Vector3(250, 1100, 1300)
  const head = new Vector3(0, 1600, 1680)
  const posOf = (side: 1 | -1) => new Vector3().setFromMatrixPosition(legendMatrix(hand, head, 1000, side))

  it('9,5 cm ut från handen, åt det håll man bett om sett från ögonen', () => {
    const r = posOf(1)
    const l = posOf(-1)
    expect(r.distanceTo(hand)).toBeCloseTo(95, 6)
    // Sett från ögonen (blicken mot handen): höger skylt till höger om handen.
    const forward = hand.clone().sub(head).setY(0).normalize()
    const viewRight = new Vector3().crossVectors(forward, new Vector3(0, 1, 0))
    expect(r.clone().sub(hand).dot(viewRight)).toBeGreaterThan(0)
    expect(l.clone().sub(hand).dot(viewRight)).toBeLessThan(0)
  })
  it('vänd mot ögonen', () => {
    const m = legendMatrix(hand, head, 1000, 1)
    const z = new Vector3().setFromMatrixColumn(m, 2).normalize()
    expect(z.dot(head.clone().sub(posOf(1)).normalize())).toBeCloseTo(1, 6)
  })
})
