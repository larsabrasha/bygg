import { describe, expect, it } from 'vitest'
import { overlapsSegment, placeLabel, type Placement, type Px } from './labelPlacement'

const size: Px = [60, 28]
/** En etikett till vänster om en lodrät kant vid x = 200, y = 300. */
const left: Placement = { m: [200, 300], n: [-1, 0], d: 36 }
const none = { placed: [], arrow: null, covers: [], view: [800, 600] as Px, margin: 8 }

describe('placeLabel', () => {
  it('står vid kanten när inget är i vägen', () => {
    expect(placeLabel(left, size, none)).toEqual([164, 300])
  })

  it('flyttas ut från kanten när en annan etikett står där, som förut', () => {
    const pos = placeLabel(left, size, { ...none, placed: [{ pos: [164, 300], size }] })
    expect(pos[1]).toBe(300)
    expect(pos[0]).toBeLessThan(164 - 60)
  })

  it('ställer sig bredvid pilen i stället för under den', () => {
    // Pilen pekar åt vänster rakt genom etikettens första läge.
    const arrow = { a: [200, 300] as Px, b: [134, 300] as Px, r: 10 }
    const pos = placeLabel(left, size, { ...none, arrow })
    expect(overlapsSegment({ pos, size }, arrow)).toBe(false)
    // Kvar vid sin kant: bara flyttad åt sidan, längs kanten.
    expect(pos[0]).toBe(164)
  })

  it('ställer sig inte under raden med knappar överst', () => {
    // Kanten uppe vid y = 30; raden täcker vänstra hörnet ner till y = 56.
    const top: Placement = { m: [120, 30], n: [0, -1], d: 20 }
    const bar = { pos: [130, 32] as Px, size: [240, 48] as Px }
    const pos = placeLabel(top, size, { ...none, covers: [bar] })
    const apart = (k: 0 | 1) => Math.abs(pos[k] - bar.pos[k]) * 2 >= size[k] + bar.size[k]
    expect(apart(0) || apart(1)).toBe(true)
  })

  it('hålls inom vyn', () => {
    const edge: Placement = { m: [790, 300], n: [1, 0], d: 36 }
    expect(placeLabel(edge, size, none)[0]).toBe(800 - 30 - 8)
  })
})
