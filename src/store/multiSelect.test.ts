import { beforeEach, describe, expect, it } from 'vitest'
import { GROUND_FRAME } from '../model/frame'
import { bodiesBox } from '../model/geometry'
import { resolveBodies } from '../model/resolve'
import { resetDocumentStore, selectedBodyIds, useDocumentStore } from './documentStore'

const s = () => useDocumentStore.getState()
const bodies = () => resolveBodies(s().doc)
const origin = (id: string) => bodies().find((b) => b.id === id)!.frame.origin
const newPart = (x = 0) => {
  const id = s().pushPullSketch(s().addSketch(GROUND_FRAME, { x0: x, y0: 0, x1: x + 400, y1: 100 })!, 22)!
  s().select(null)
  return id
}

describe('flera valda delar', () => {
  beforeEach(() => resetDocumentStore())

  it('Skift-klick lägger till och tar bort; den senast tillagda är den valda', () => {
    const [a, b, c] = [newPart(0), newPart(500), newPart(1000)]
    s().toggleSelected(a)
    s().toggleSelected(b)
    s().toggleSelected(c)
    expect(s().selection).toEqual({ kind: 'body', id: c })
    expect(selectedBodyIds(s())).toEqual([c, b, a])
    s().toggleSelected(b)
    expect(selectedBodyIds(s())).toEqual([c, a])
    // Den valda tas bort: nästa blir vald.
    s().toggleSelected(c)
    expect(selectedBodyIds(s())).toEqual([a])
    s().toggleSelected(a)
    expect(s().selection).toBeNull()
    // Ett vanligt val ersätter alla.
    s().selectBodies([a, b])
    s().select({ kind: 'body', id: c })
    expect(selectedBodyIds(s())).toEqual([c])
  })

  it('flyttar och vrider alla i ett ångra-steg', () => {
    const [a, b] = [newPart(0), newPart(500)]
    s().selectBodies([a, b])
    const steps = s().past.length
    s().moveInstances([a, b], [0, 0, 300])
    expect([origin(a)[2], origin(b)[2]]).toEqual([300, 300])
    expect(s().past.length).toBe(steps + 1)
    // Valet står kvar efter flytten.
    expect(selectedBodyIds(s())).toEqual([b, a])
    const left = (id: string) => bodiesBox(bodies().filter((x) => x.id === id)).min[0]
    // Runt mitten av båda: a (0–400) hamnar där b var (500–900), och tvärtom.
    s().rotateInstances([a, b], [450, 0, 0], [0, 1, 0], 180)
    expect(left(a)).toBeCloseTo(500)
    expect(left(b)).toBeCloseTo(0)
    expect(s().past.length).toBe(steps + 2)
    s().undo()
    expect(left(a)).toBeCloseTo(0)
    // Efter ångra är bara det som var valt då valt.
    expect(s().also).toEqual([])
  })

  it('kopierar alla, och kopiorna blir valda', () => {
    const [a, b] = [newPart(0), newPart(500)]
    s().selectBodies([a, b])
    s().duplicateSelection()
    const copies = selectedBodyIds(s())
    expect(copies).toHaveLength(2)
    expect(copies).not.toContain(a)
    // Bredvid originalen: hela gruppens bredd (900) plus mellanrummet.
    const left = (id: string) => bodiesBox(bodies().filter((x) => x.id === id)).min[0]
    expect(copies.map(left).sort((x, y) => x - y)).toEqual([950, 1450])
    // Länkade: samma form som originalen.
    const defOf = (id: string) => s().doc.instances.find((i) => i.id === id)!.defId
    expect(new Set(copies.map(defOf))).toEqual(new Set([a, b].map(defOf)))
  })

  it('kopierar alla åt den sida man valt på den valda delen', () => {
    const [a, b] = [newPart(0), newPart(500)]
    s().selectBodies([a, b])
    // Sidan på den valda: v+ på golvets delar (v = −z) är baksidan.
    useDocumentStore.setState({ selection: { kind: 'body', id: b, face: 'v+' } })
    s().duplicateSelection()
    const copies = selectedBodyIds(s())
    const box = bodiesBox(bodies().filter((x) => copies.includes(x.id)))
    // Hela gruppens djup (100) och glappet bakåt; i sidled står de kvar.
    expect([box.min[2], box.max[2]]).toEqual([-250, -150])
    expect([box.min[0], box.max[0]]).toEqual([0, 900])
    expect(s().selection).toMatchObject({ face: 'v+' })
  })

  it('byter material på alla, också på deras länkade kopior, i ett steg', () => {
    const [a, b] = [newPart(0), newPart(500)]
    const [twin] = s().addCopies(a, [{ ...GROUND_FRAME, origin: [0, 0, 500] }])
    s().selectBodies([a, b])
    const steps = s().past.length
    s().updateParts([a, b], { material: 'ek' })
    expect(bodies().map((x) => x.material)).toEqual(['ek', 'ek', 'ek'])
    expect(bodies().find((x) => x.id === twin)!.material).toBe('ek')
    expect(s().past.length).toBe(steps + 1)
  })

  it('tar bort alla valda, och inget är valt efteråt', () => {
    const [a, b, c] = [newPart(0), newPart(500), newPart(1000)]
    s().selectBodies([a, b])
    s().deleteSelection()
    expect(bodies().map((x) => x.id)).toEqual([c])
    expect(s().selection).toBeNull()
    expect(s().also).toEqual([])
  })

  it('glömmer tillagda delar som inte finns längre', () => {
    const [a, b] = [newPart(0), newPart(500)]
    s().selectBodies([a, b])
    // En annan ändring tar bort a (t.ex. från CLI:t); valet ska inte peka på den.
    s().select({ kind: 'body', id: a })
    s().deleteSelection()
    s().toggleSelected(b)
    s().toggleSelected(a)
    expect(selectedBodyIds(s())).toEqual([b])
  })
})
