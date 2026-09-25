import { beforeEach, describe, expect, it } from 'vitest'
import { GROUND_FRAME } from '../model/frame'
import { resolveBodies } from '../model/resolve'
import { resetDocumentStore, useDocumentStore } from './documentStore'

const s = () => useDocumentStore.getState()
const bodies = () => resolveBodies(s().doc)
const rect = { x0: 0, y0: 0, x1: 800, y1: 120 }
const newPart = (depth = 22) => s().pushPullSketch(s().addSketch(GROUND_FRAME, rect)!, depth)!

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

  it('ger nya delar namn och standardmaterial', () => {
    newPart()
    newPart()
    expect(bodies().map((b) => [b.name, b.material])).toEqual([
      ['Del 1', 'furu'],
      ['Del 2', 'furu'],
    ])
  })

  it('ändrar namn och material, och hoppar över ändringar som inte ändrar något', () => {
    const id = newPart()
    const before = s().past.length
    s().updatePart(id, { name: 'Del 1' })
    expect(s().past).toHaveLength(before)
    s().updatePart(id, { name: 'Sarg', material: 'ek' })
    expect(bodies()[0]).toMatchObject({ name: 'Sarg', material: 'ek' })
    expect(s().past).toHaveLength(before + 1)
  })

  it('tar bort vald del och dess form, och kan ångra', () => {
    newPart()
    s().deleteSelection()
    expect(s().doc.instances).toHaveLength(0)
    expect(s().doc.defs).toHaveLength(0)
    expect(s().selection).toBeNull()
    s().undo()
    expect(bodies()).toHaveLength(1)
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

  it('tömmer modellen, och det går att ångra', () => {
    newPart()
    s().clearDocument()
    expect(bodies()).toHaveLength(0)
    s().undo()
    expect(bodies()).toHaveLength(1)
  })
})

describe('kopior (komponenter)', () => {
  beforeEach(() => resetDocumentStore())

  it('länkad kopia hamnar bredvid och delar form', () => {
    const a = newPart()
    const b = s().duplicateLinked(a)!
    const [ba, bb] = bodies()
    expect(bb!.defId).toBe(ba!.defId)
    expect(bb!.frame.origin).toEqual([850, 0, 0]) // 800 bred + 50 glapp
    expect(s().selection).toEqual({ kind: 'body', id: b })
  })

  it('push/pull på en kopia ändrar alla kopior', () => {
    const a = newPart()
    const b = s().duplicateLinked(a)!
    s().pushPullBody(b, 'n+', 10)
    expect(bodies().map((x) => x.z1)).toEqual([32, 32])
  })

  it('namn och material delas av kopiorna', () => {
    const a = newPart()
    s().duplicateLinked(a)
    s().updatePart(a, { name: 'Ben' })
    expect(bodies().map((x) => x.name)).toEqual(['Ben', 'Ben'])
  })

  it('gör unik bryter länken', () => {
    const a = newPart()
    const b = s().duplicateLinked(a)!
    s().makeUnique(b)
    s().pushPullBody(b, 'n+', 10)
    expect(bodies().map((x) => x.z1)).toEqual([22, 32])
    expect(bodies()[1]!.name).toBe('Del 2')
  })

  it('formen finns kvar tills sista kopian tas bort', () => {
    const a = newPart()
    s().duplicateLinked(a)
    s().deleteSelection()
    expect(s().doc.defs).toHaveLength(1)
    s().select({ kind: 'body', id: a })
    s().deleteSelection()
    expect(s().doc.defs).toHaveLength(0)
  })

  it('flyttar en kopia', () => {
    const a = newPart()
    s().moveInstance(a, [100, 0, -50])
    expect(bodies()[0]!.frame.origin).toEqual([100, 0, -50])
  })
})

describe('fiber och tjocklek', () => {
  beforeEach(() => resetDocumentStore())

  it('vrid fibern byter L och B, och kaplistan följer', () => {
    const a = newPart()
    expect(s().doc.defs[0]).toMatchObject({ grainAxis: 'u', thicknessAxis: 'n' })
    s().updatePart(a, { grainAxis: 'v' })
    expect(s().doc.defs[0]).toMatchObject({ grainAxis: 'v', thicknessAxis: 'n' })
  })

  it('fiber längs tjockleksaxeln löses genom att de byter plats', () => {
    const a = newPart()
    s().updatePart(a, { grainAxis: 'n' })
    expect(s().doc.defs[0]).toMatchObject({ grainAxis: 'n', thicknessAxis: 'u' })
  })
})

describe('parametrar', () => {
  beforeEach(() => resetDocumentStore())

  it('skapar parametrar med unika standardnamn', () => {
    s().addParam()
    s().addParam()
    expect(s().doc.params.map((p) => [p.name, p.value])).toEqual([
      ['mått1', 100],
      ['mått2', 100],
    ])
  })

  it('mått kan sättas som uttryck och följer parametern', () => {
    const p = s().addParam()
    s().updateParam(p, { name: 'tjocklek', expr: '22' })
    const a = newPart(30)
    expect(s().setExtent(a, 'n', 'tjocklek')).toBeNull()
    expect(bodies()[0]!.z1).toBe(22)
    s().updateParam(p, { expr: '18' })
    expect(bodies()[0]!.z1).toBe(18)
  })

  it('ett rent tal tar bort uttrycket', () => {
    const p = s().addParam()
    s().updateParam(p, { name: 't', expr: '22' })
    const a = newPart()
    s().setExtent(a, 'n', 't')
    s().setExtent(a, 'n', '40')
    s().updateParam(p, { expr: '18' })
    expect(bodies()[0]!.z1).toBe(40)
  })

  it('push/pull på en axel tar bort dess uttryck', () => {
    const p = s().addParam()
    s().updateParam(p, { name: 't', expr: '22' })
    const a = newPart()
    s().setExtent(a, 'n', 't')
    s().pushPullBody(a, 'n+', 10)
    expect(s().doc.defs[0]!.dims).toBeUndefined()
  })

  it('byter namn i alla uttryck', () => {
    const p = s().addParam()
    s().updateParam(p, { name: 't', expr: '22' })
    const q = s().addParam()
    s().updateParam(q, { name: 'dubbel', expr: 't * 2' })
    const a = newPart()
    s().setExtent(a, 'n', 't')
    expect(s().updateParam(p, { name: 'tjocklek' })).toBeNull()
    expect(s().doc.params[1]!.expr).toBe('tjocklek * 2')
    expect(s().doc.defs[0]!.dims?.n?.expr).toBe('tjocklek')
  })

  it('avvisar ogiltiga namn, dubbletter, fel och cirkelreferenser', () => {
    const p = s().addParam()
    const q = s().addParam()
    expect(s().updateParam(p, { name: '2x' })).toMatch(/bokstäver/)
    expect(s().updateParam(p, { name: 'mått2' })).toMatch(/finns redan/)
    expect(s().updateParam(p, { expr: 'mått2 +' })).toBeTruthy()
    s().updateParam(p, { expr: 'mått2' })
    expect(s().updateParam(q, { expr: 'mått1' })).toMatch(/Cirkel/)
  })

  it('ångra på parameterändring återställer också måtten', () => {
    const p = s().addParam()
    s().updateParam(p, { name: 't', expr: '22' })
    const a = newPart()
    s().setExtent(a, 'n', 't')
    s().updateParam(p, { expr: '18' })
    s().undo()
    expect(bodies()[0]!.z1).toBe(22)
  })

  it('tar inte bort en parameter som används', () => {
    const p = s().addParam()
    s().updateParam(p, { name: 't', expr: '22' })
    const a = newPart()
    s().setExtent(a, 'n', 't')
    expect(s().deleteParam(p)).toBe(false)
    s().setExtent(a, 'n', '22')
    expect(s().deleteParam(p)).toBe(true)
  })
})
