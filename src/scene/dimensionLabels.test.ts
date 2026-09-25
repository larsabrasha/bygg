import { describe, expect, it } from 'vitest'
import { GROUND_FRAME } from '../model/frame'
import type { ModelDocument } from '../model/types'
import type { PushPullOp } from '../store/toolStore'
import { dimensionsFor, shownDimensionsOf } from './dimensionLabels'

const doc: ModelDocument = {
  sketches: [],
  params: [],
  defs: [
    {
      id: 'd1',
      name: 'Del 1',
      material: 'furu',
      grainAxis: 'u',
      thicknessAxis: 'n',
      profile: { x0: 0, y0: 0, x1: 800, y1: 120 },
      z0: 0,
      z1: 22,
    },
  ],
  instances: [{ id: 'i1', defId: 'd1', frame: GROUND_FRAME }],
}

describe('dimensionsFor', () => {
  it('visar inga mått när en del bara är vald, utom med måtten påslagna', () => {
    expect(dimensionsFor(doc, null)).toBeNull()
    expect(dimensionsFor(doc, null, 'i1')).toMatchObject({ live: false, changing: null, def: { id: 'd1' } })
    // Knappen gäller i Välj, när inget pågår.
    expect(shownDimensionsOf(true, 'select', null, { kind: 'body', id: 'i1' })).toBe('i1')
    expect(shownDimensionsOf(false, 'select', null, { kind: 'body', id: 'i1' })).toBeNull()
    expect(shownDimensionsOf(true, 'move', null, { kind: 'body', id: 'i1' })).toBeNull()
    expect(shownDimensionsOf(true, 'select', null, { kind: 'sketch', id: 's1' })).toBeNull()
  })

  it('visar delen som den blir under push/pull, med axeln som ändras', () => {
    const op = {
      kind: 'pushpull',
      target: { kind: 'body', id: 'i1', face: 'u+' },
      anchor: [800, 11, -60],
      normal: [1, 0, 0],
      grab: 0,
      targets: [],
      distance: 200,
      onTarget: false,
    } satisfies PushPullOp
    const t = dimensionsFor(doc, op)
    expect(t).toMatchObject({ live: true, changing: 'u', body: { profile: { x1: 1000 } } })
  })

  it('visar den nya delen när en skiss dras ut', () => {
    const withSketch = {
      ...doc,
      sketches: [{ id: 's1', frame: GROUND_FRAME, rect: { x0: 0, y0: 0, x1: 600, y1: 400 } }],
    }
    const op = {
      kind: 'pushpull',
      target: { kind: 'sketch', id: 's1' },
      anchor: [300, 0, -200],
      normal: [0, 1, 0],
      grab: 0,
      targets: [],
      distance: 18,
      onTarget: false,
    } satisfies PushPullOp
    const t = dimensionsFor(withSketch, op)
    expect(t).toMatchObject({ live: true, changing: 'n', body: { z1: 18 } })
  })

  it('visar inga mått under andra operationer', () => {
    const op = { kind: 'rotate', instanceId: 'i1', axis: 1, plane: GROUND_FRAME, radius: 1, grab: 0, angle: 0 } as const
    expect(dimensionsFor(doc, op)).toBeNull()
  })
})
