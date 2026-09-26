import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { legendMatrix, menuMatrix } from './menuPose'

describe('menuMatrix', () => {
  const hand = new Vector3(-250, 1100, 1300)
  const head = new Vector3(0, 1600, 1680)
  const m = menuMatrix(hand, head, 1000)
  const pos = new Vector3().setFromMatrixPosition(m)
  const x = new Vector3().setFromMatrixColumn(m, 0).normalize()
  const z = new Vector3().setFromMatrixColumn(m, 2).normalize()

  it('nederkanten 4 cm ovanför handen', () => {
    expect(pos.toArray()).toEqual([-250, 1140, 1300])
  })
  it('framsidan vänd mot ögonen', () => {
    const toHead = head.clone().sub(pos).normalize()
    expect(z.dot(toHead)).toBeCloseTo(1, 6)
  })
  it('ingen lutning åt sidan: kanterna är vågräta', () => {
    expect(x.y).toBeCloseTo(0, 6)
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
