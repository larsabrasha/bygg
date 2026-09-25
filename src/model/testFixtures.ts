import { GROUND_FRAME } from './frame'
import type { Body, Sketch } from './types'

export function testSketch(overrides: Partial<Sketch> = {}): Sketch {
  return { id: 's1', frame: GROUND_FRAME, rect: { x0: 0, y0: 0, x1: 800, y1: 120 }, ...overrides }
}

export function testBody(overrides: Partial<Body> = {}): Body {
  return {
    id: 'b1',
    name: 'Del 1',
    material: 'furu',
    grain: 'length',
    frame: GROUND_FRAME,
    profile: { x0: 0, y0: 0, x1: 800, y1: 120 },
    z0: 0,
    z1: 22,
    ...overrides,
  }
}
