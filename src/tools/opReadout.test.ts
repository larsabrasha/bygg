import { describe, expect, it } from 'vitest'
import { GROUND_FRAME } from '../model/frame'
import type { MoveOp, PushPullOp, RotateOp } from '../store/toolStore'
import { opReadout } from './opReadout'

const pushPull = (distance: number): PushPullOp => ({
  kind: 'pushpull',
  target: { kind: 'body', id: 'i1', face: 'u+' },
  anchor: [600, 11, -200],
  normal: [1, 0, 0],
  grab: 0,
  targets: [],
  distance,
  onTarget: false,
})

describe('värdet vid pilen', () => {
  it('push/pull: avståndet med tecken, vid ytan där pilen sitter', () => {
    expect(opReadout(pushPull(134))).toEqual({ at: [734, 11, -200], text: '+134 mm' })
    expect(opReadout(pushPull(-20.5))?.text).toBe('−20,5 mm')
    expect(opReadout(pushPull(0))).toBeNull()
  })

  it('flytta: med tecken längs en pil, bara längden fritt i planet', () => {
    const op = {
      kind: 'move',
      instanceId: 'i1',
      plane: GROUND_FRAME,
      axis: 0,
      grab: 0,
      moving: [],
      targets: { xs: [], ys: [] },
      delta: [-40, 0],
      onTarget: [false, false],
    } as unknown as MoveOp
    expect(opReadout(op)?.text).toBe('−40 mm')
    expect(opReadout({ ...op, axis: null, delta: [30, 40] })?.text).toBe('50 mm')
  })

  it('vrida: vinkeln med tecken, vid ekern', () => {
    const op = { kind: 'rotate', plane: GROUND_FRAME, radius: 100, grab: 0, angle: 90 } as unknown as RotateOp
    const r = opReadout(op)!
    expect(r.text).toBe('+90°')
    expect(r.at.map((x) => Math.round(x))).toEqual(
      [0, 1, 2].map((k) => Math.round(GROUND_FRAME.origin[k]! + 100 * GROUND_FRAME.v[k]!)),
    )
  })
})
