import { beforeEach, describe, expect, it } from 'vitest'
import { GROUND_FRAME } from '../model/frame'
import { resetDocumentStore, useDocumentStore } from './documentStore'

const s = () => useDocumentStore.getState()
const rect = { x0: 0, y0: 0, x1: 800, y1: 120 }

describe('documentStore', () => {
  beforeEach(() => resetDocumentStore())

  it('skapar skiss och väljer den', () => {
    const id = s().addSketch(GROUND_FRAME, rect)
    expect(s().selection).toEqual({ kind: 'sketch', id })
  })

  it('avvisar för liten skiss', () => {
    expect(s().addSketch(GROUND_FRAME, { x0: 0, y0: 0, x1: 0.5, y1: 100 })).toBeNull()
    expect(s().past).toHaveLength(0)
  })

  it('ger nya kroppar namn och standardmaterial', () => {
    s().pushPullSketch(s().addSketch(GROUND_FRAME, rect)!, 22)
    s().pushPullSketch(s().addSketch(GROUND_FRAME, rect)!, 22)
    expect(s().doc.bodies.map((b) => [b.name, b.material])).toEqual([
      ['Del 1', 'furu'],
      ['Del 2', 'furu'],
    ])
  })

  it('ändrar namn och material, och hoppar över ändringar som inte ändrar något', () => {
    const id = s().pushPullSketch(s().addSketch(GROUND_FRAME, rect)!, 22)!
    const before = s().past.length
    s().updateBody(id, { name: 'Del 1' })
    expect(s().past).toHaveLength(before)
    s().updateBody(id, { name: 'Sarg', material: 'ek' })
    expect(s().doc.bodies[0]).toMatchObject({ name: 'Sarg', material: 'ek' })
    expect(s().past).toHaveLength(before + 1)
  })

  it('tar bort vald kropp och kan ångra', () => {
    s().pushPullSketch(s().addSketch(GROUND_FRAME, rect)!, 22)
    s().deleteSelection()
    expect(s().doc.bodies).toHaveLength(0)
    expect(s().selection).toBeNull()
    s().undo()
    expect(s().doc.bodies).toHaveLength(1)
  })

  it('ångra släpper valet om det valda inte finns i det gamla dokumentet', () => {
    s().addSketch(GROUND_FRAME, rect)
    s().undo()
    expect(s().selection).toBeNull()
    s().redo()
    expect(s().doc.sketches).toHaveLength(1)
  })

  it('ny ändring efter ångra rensar gör om', () => {
    s().addSketch(GROUND_FRAME, rect)
    s().undo()
    s().addSketch(GROUND_FRAME, rect)
    expect(s().future).toHaveLength(0)
  })
})
