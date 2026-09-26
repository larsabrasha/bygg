import { beforeEach, describe, expect, it } from 'vitest'
import { resolveBodies } from '../model/resolve'
import type { Vec3 } from '../model/types'
import { resetDocumentStore, useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import { applyMeasure, commit, move, tap } from '../tools/actions'
import { measureModel, submitMeasure, typeMeasure } from './measureModel'

const docs = () => useDocumentStore.getState()
const tools = () => useToolStore.getState()

beforeEach(() => {
  resetDocumentStore()
  useToolStore.setState({ lastPushPull: null, lastOp: null, op: null })
  tools().setTool('select')
})

/** En skiva 600 × 400 × 22 på golvet, med verktyget Välj och inget valt. */
function board() {
  tools().setTool('rect')
  tap({ point: [0, 0, 0], target: { kind: 'ground' } }, 0)
  move({ origin: [600, 5000, -400] as Vec3, dir: [0, -1, 0] as Vec3 }, 0)
  commit()
  tools().setTool('pushpull')
  tap({ point: [0, 0, 0], target: { kind: 'sketch', id: docs().doc.sketches.at(-1)!.id } }, 0)
  tools().setMeasure(0, '22')
  applyMeasure()
  tools().setTool('select')
  docs().select(null)
  return resolveBodies(docs().doc).at(-1)!
}

const thickness = () => {
  const b = resolveBodies(docs().doc)[0]!
  return b.z1 - b.z0
}

describe('måttrutan på en vald sida', () => {
  it('syns igen när man väljer samma sida efter OK, och ändrar den en gång till', () => {
    const b = board()
    const top = { point: [300, 22, -200] as Vec3, target: { kind: 'body', id: b.id, face: 'n+' } as const }
    tap(top, 0)
    expect(measureModel().ready).not.toBeNull()
    typeMeasure(0, '30')
    submitMeasure()
    expect(docs().selection).toBeNull()
    expect(thickness()).toBe(30)

    tap({ ...top, point: [300, 30, -200] }, 0)
    const m = measureModel()
    expect(m.visible).toBe(true)
    expect(m.ready).not.toBeNull()
    typeMeasure(0, '40')
    submitMeasure()
    expect(thickness()).toBe(40)
  })
})
