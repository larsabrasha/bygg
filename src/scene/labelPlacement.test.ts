import { describe, expect, it } from 'vitest'
import { overlapsSegment, placeLabel, type Placement, type Px } from './labelPlacement'

const size: Px = [60, 28]
/** En etikett till vänster om en lodrät kant vid x = 200, y = 300. */
const left: Placement = { m: [200, 300], n: [-1, 0], d: 36 }

describe('placeLabel', () => {
  it('står vid kanten när inget är i vägen', () => {
    expect(placeLabel(left, size, [], null)).toEqual([164, 300])
  })

  it('flyttas ut från kanten när en annan etikett står där, som förut', () => {
    const pos = placeLabel(left, size, [{ pos: [164, 300], size }], null)
    expect(pos[1]).toBe(300)
    expect(pos[0]).toBeLessThan(164 - 60)
  })

  it('ställer sig bredvid pilen i stället för under den', () => {
    // Pilen pekar åt vänster rakt genom etikettens första läge.
    const arrow = { a: [200, 300] as Px, b: [134, 300] as Px, r: 10 }
    const pos = placeLabel(left, size, [], arrow)
    expect(overlapsSegment({ pos, size }, arrow)).toBe(false)
    // Kvar vid sin kant: bara flyttad åt sidan, längs kanten.
    expect(pos[0]).toBe(164)
  })
})
