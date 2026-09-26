import { describe, expect, it } from 'vitest'
import { buildCutList } from './cutlist'
import { rowNames } from './cutlistExport'
import { dimensionEdges } from './dimensions'
import { circleFace, circleRect, pushPullBody, pushPullMin, sketchToPart } from './geometry'
import { setBoxExtent } from './params'
import { testBody, testSketch } from './testFixtures'

/** Ett runt ben: Ø 40, 800 långt längs n. */
const leg = () =>
  testBody({
    shape: 'circle',
    profile: { x0: 0, y0: 0, x1: 40, y1: 40 },
    z0: 0,
    z1: 800,
    grainAxis: 'n',
    thicknessAxis: 'u',
  })

describe('cirkel och cylinder', () => {
  it('cirkeln ligger inskriven i en kvadrat kring mitten', () => {
    expect(circleRect([100, 50], [130, 90])).toEqual({ x0: 50, y0: 0, x1: 150, y1: 100 })
  })

  it('en utdragen cirkel blir en cylinder', () => {
    const s = testSketch({ shape: 'circle', rect: { x0: 0, y0: 0, x1: 40, y1: 40 } })
    const part = sketchToPart(s, 800, { defId: 'd', instanceId: 'i', name: 'Ben', material: 'ek' })
    expect(part?.def).toMatchObject({ shape: 'circle', z0: 0, z1: 800, grainAxis: 'n' })
  })

  it('en rektangel får ingen shape', () => {
    const part = sketchToPart(testSketch(), 22, { defId: 'd', instanceId: 'i', name: 'Del', material: 'ek' })
    expect(part?.def).not.toHaveProperty('shape')
  })

  it('träffar på ändarna är n+ och n−, på den runda sidan den sida normalen pekar mot', () => {
    expect(circleFace([0, 0, 1])).toBe('n+')
    expect(circleFace([0.1, 0, -1])).toBe('n-')
    expect(circleFace([0.9, 0.4, 0])).toBe('u+')
    expect(circleFace([-0.2, -0.95, 0])).toBe('v-')
  })

  it('push/pull på den runda sidan ändrar diametern, och motsatta sidan står still', () => {
    const b = pushPullBody(leg(), 'u+', 20)!
    expect(b.profile).toEqual({ x0: 0, y0: -10, x1: 60, y1: 50 })
    // Längden ändras inte, och ändarna fungerar som vanligt.
    expect(b.z1).toBe(800)
    expect(pushPullBody(leg(), 'n+', 100)).toMatchObject({ z1: 900, profile: leg().profile })
    expect(pushPullMin(leg(), 'v-')).toBe(1 - 40)
  })

  it('ett nytt mått på en av profilaxlarna sätter diametern', () => {
    const b = setBoxExtent(leg(), 'v', 30, 'min')!
    expect(b.profile).toEqual({ x0: 5, y0: 0, x1: 35, y1: 30 })
  })

  it('kaplistan visar diametern, och volymen är en cylinders', () => {
    const list = buildCutList([leg()])
    expect(list.rows[0]).toMatchObject({ length: 800, width: 40, thickness: 40, round: { diameter: 40, length: 800 } })
    expect(list.totalVolumeM3).toBeCloseTo((Math.PI * 20 * 20 * 800) / 1e9)
    expect(rowNames(list.rows[0]!)).toBe('Del 1 (rund Ø 40)')
    // En fyrkantig del med samma mått är en annan rad.
    const square = testBody({ ...leg(), id: 'b2', shape: undefined })
    expect(buildCutList([leg(), square]).rows).toHaveLength(2)
  })

  it('måtten sitter på cylindern: diametern över ändytan närmast kameran, längden längs sidan', () => {
    // Kameran snett ovanför (världens y är uppåt), åt +x.
    const [dia, len] = dimensionEdges(leg(), [1000, 2000, 0])
    expect(dia).toMatchObject({ axis: 'u' })
    // GROUND_FRAME: u = x, v = −z, n = y. Ändytan n = 800 ligger närmast.
    expect(dia!.from[1]).toBeCloseTo(800)
    expect(Math.hypot(dia!.to[0] - dia!.from[0], dia!.to[2] - dia!.from[2])).toBeCloseTo(40)
    expect(len).toMatchObject({ axis: 'n' })
    expect(len!.to[1] - len!.from[1]).toBeCloseTo(800)
  })
})
