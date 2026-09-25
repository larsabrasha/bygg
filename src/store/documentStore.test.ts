import { beforeEach, describe, expect, it } from 'vitest'
import { GROUND_FRAME, toWorld } from '../model/frame'
import { anglesOf } from '../model/orientation'
import { minCorner } from '../model/placement'
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

  it('vrider en kopia runt en axel, och det går att ångra', () => {
    const a = newPart()
    const before = bodies()[0]!.frame
    s().rotateInstance(a, [0, 0, 0], [0, 1, 0], 90)
    expect(bodies()[0]!.frame.u).toEqual([0, 0, -1])
    s().undo()
    expect(bodies()[0]!.frame).toEqual(before)
  })

  it('vinklar från detaljpanelen vrider runt mitten och räknas från viloläget', () => {
    const a = newPart()
    // Del 800 × 120 × 22 på golvet: mitten (400, 11, −60).
    expect(s().setAngle(a, 'y', '90')).toBeNull()
    const inst = () => s().doc.instances[0]!
    expect(inst().frame.u).toEqual([0, 0, -1])
    expect(inst().rest).toEqual({ u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0] })
    const b = bodies()[0]!
    expect(toWorld(b.frame, [400, 60, 11])).toEqual([400, 11, -60])
    // Vrider man med bågarna efteråt räknas det från samma viloläge.
    s().rotateInstance(a, [400, 11, -60], [0, 1, 0], -60)
    expect(anglesOf(inst().frame, inst().rest!)).toEqual([0, 30, 0])
    expect(s().setAngle(a, 'x', 'foo')).not.toBeNull()
  })

  it('kopior räknar vinklar från samma viloläge som originalet', () => {
    const a = newPart()
    s().setAngle(a, 'y', '30')
    const copy = s().duplicateLinked(a)!
    const c = s().doc.instances.find((i) => i.id === copy)!
    expect(anglesOf(c.frame, c.rest!)[1]).toBeCloseTo(30)
    const [more] = s().addCopies(a, [c.frame])
    const m = s().doc.instances.find((i) => i.id === more)!
    expect(anglesOf(m.frame, m.rest!)[1]).toBeCloseTo(30)
  })

  it('vridning ett helt varv sparas inte i historiken', () => {
    const a = newPart()
    const steps = s().past.length
    s().rotateInstance(a, [0, 0, 0], [0, 1, 0], 360)
    expect(s().past).toHaveLength(steps)
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

describe('läge', () => {
  beforeEach(() => resetDocumentStore())
  const corner = () => {
    const d = s().doc
    return minCorner(d.instances[0]!, d.defs[0]!)
  }

  it('sätter läget från ett tal, och det går att ångra', () => {
    const id = newPart()
    expect(s().setPosition(id, 'y', '450')).toBeNull()
    expect(corner()).toEqual([0, 450, -120])
    expect(s().doc.instances[0]).not.toHaveProperty('pos')
    s().undo()
    expect(corner()).toEqual([0, 0, -120])
  })

  it('ett uttryck följer parametern', () => {
    const id = newPart()
    const p = s().addParam()
    s().updateParam(p, { name: 'hojd', expr: '722' })
    expect(s().setPosition(id, 'y', 'hojd - 22')).toBeNull()
    expect(corner()[1]).toBe(700)
    s().updateParam(p, { expr: '900' })
    expect(corner()[1]).toBe(878)
  })

  it('byter namn på parametern i läget också', () => {
    const id = newPart()
    const p = s().addParam()
    s().updateParam(p, { name: 'hojd', expr: '700' })
    s().setPosition(id, 'y', 'hojd')
    s().updateParam(p, { name: 'h' })
    expect(s().doc.instances[0]!.pos).toEqual({ y: 'h' })
  })

  it('avvisar uttryck som inte går att beräkna', () => {
    const id = newPart()
    expect(s().setPosition(id, 'x', 'okänd + 1')).toMatch(/okänd/i)
    expect(corner()).toEqual([0, 0, -120])
  })

  it('flytt för hand tar bort uttrycket för den axeln', () => {
    const id = newPart()
    const p = s().addParam()
    s().updateParam(p, { name: 'a', expr: '100' })
    s().setPosition(id, 'x', 'a')
    s().setPosition(id, 'y', 'a')
    s().moveInstance(id, [50, 0, 0])
    expect(s().doc.instances[0]!.pos).toEqual({ y: 'a' })
    expect(corner()).toEqual([150, 100, -120])
  })

  it('kopior får inga lägesuttryck, annars drogs de tillbaka till originalet', () => {
    const id = newPart()
    const p = s().addParam()
    s().updateParam(p, { name: 'a', expr: '100' })
    s().setPosition(id, 'x', 'a')
    const frame = s().doc.instances[0]!.frame
    const [copy] = s().addCopies(id, [{ ...frame, origin: [frame.origin[0] + 1000, 0, 0] }])
    const inst = s().doc.instances.find((i) => i.id === copy)!
    expect(inst).not.toHaveProperty('pos')
    expect(inst.frame.origin[0]).toBe(frame.origin[0] + 1000)
  })

  it('vridning tar bort uttrycket bara för axlar där hörnet flyttas', () => {
    const id = newPart()
    const p = s().addParam()
    s().updateParam(p, { name: 'a', expr: '100' })
    for (const axis of ['x', 'y', 'z'] as const) s().setPosition(id, axis, 'a')
    // 90° runt Y genom delens mitt (800 × 22 × 120): x och z byter utsträckning, höjden står still.
    s().rotateInstance(id, [400, 11, -60], [0, 1, 0], 90)
    expect(s().doc.instances[0]!.pos).toEqual({ y: 'a' })
  })

  it('push/pull på sidan närmast origo tar bort uttrycket, annars flyttar delen tillbaka', () => {
    const id = newPart()
    const p = s().addParam()
    s().updateParam(p, { name: 'a', expr: '100' })
    s().setPosition(id, 'x', 'a')
    s().pushPullBody(id, 'u-', 30)
    expect(s().doc.instances[0]).not.toHaveProperty('pos')
    expect(corner()[0]).toBe(70)
    // Sidan bort från origo påverkar inte hörnet; uttrycket får ligga kvar.
    s().setPosition(id, 'x', 'a')
    s().pushPullBody(id, 'u+', 30)
    expect(s().doc.instances[0]!.pos).toEqual({ x: 'a' })
  })
})
