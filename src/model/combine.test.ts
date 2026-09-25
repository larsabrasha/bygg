import { beforeEach, describe, expect, it } from 'vitest'
import { resetDocumentStore, useDocumentStore } from '../store/documentStore'
import { blankBox, composeFrame, relativeFrame } from './combine'
import { buildCutList } from './cutlist'
import { GROUND_FRAME, rotateFrame } from './frame'
import { resolveBodies } from './resolve'
import type { Frame, ModelDocument, PartDef } from './types'

const docs = () => useDocumentStore.getState()
const bodies = () => resolveBodies(docs().doc)

const def = (id: string, x1: number, y1: number, z1: number, extra: Partial<PartDef> = {}): PartDef => ({
  id,
  name: id,
  material: 'ek',
  grainAxis: 'n',
  thicknessAxis: 'u',
  profile: { x0: 0, y0: 0, x1, y1 },
  z0: 0,
  z1,
  ...extra,
})
const at = (x: number, y: number, z: number): Frame => ({ ...GROUND_FRAME, origin: [x, y, z] })

/** Två länkade ben (40×40×800) och en regel (tapp) som sticker in i det första. */
function legsAndTenon(): ModelDocument {
  return {
    sketches: [],
    params: [],
    defs: [def('ben', 40, 40, 800), def('tapp', 30, 10, 20)],
    instances: [
      { id: 'ben1', defId: 'ben', frame: at(0, 0, 0) },
      { id: 'ben2', defId: 'ben', frame: at(1000, 0, 0) },
      { id: 'hål', defId: 'tapp', frame: at(5, 700, -15) },
    ],
  }
}

beforeEach(() => {
  resetDocumentStore()
  docs().load(legsAndTenon())
})

describe('lägg till och skär ut', () => {
  it('en frame räknas om till värdens koordinater och tillbaka', () => {
    const host = rotateFrame(at(100, 0, 50), [100, 0, 50], [0, 1, 0], 90)
    const f = rotateFrame(at(130, 20, 10), [0, 0, 0], [1, 0, 0], 30)
    const back = composeFrame(host, relativeFrame(host, f))
    for (const k of ['origin', 'u', 'v', 'n'] as const) back[k].forEach((x, i) => expect(x).toBeCloseTo(f[k][i]!))
  })

  it('urskärningen gäller alla länkade kopior, på samma ställe i förhållande till dem', () => {
    expect(docs().combine('hål', 'subtract', 'ben1')).toBeNull()
    const [b1, b2, tool] = bodies()
    expect(tool!.tool).toEqual({ op: 'subtract', host: 'ben1' })
    expect(b1!.tools).toHaveLength(1)
    expect(b2!.tools).toBe(b1!.tools)
    expect(b1!.tools![0]!.frame.origin).toEqual([5, 15, 700])
    // Hålet ändrar inte ämnet, och verktyget är ingen egen bit i kaplistan.
    expect(b1!.blank).toBeUndefined()
    const list = buildCutList(bodies())
    expect(list.totalCount).toBe(2)
    expect(list.rows).toHaveLength(1)
    expect(docs().selection).toEqual({ kind: 'body', id: 'ben1' })
  })

  it('ett tillägg gör ämnet större', () => {
    const box = def('regel', 400, 60, 20)
    // Tappen i regelns egna koordinater: 30 ut från änden längs u.
    const frame: Frame = { origin: [400, 10, 5], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] }
    const tenon = { op: 'add' as const, profile: { x0: 0, y0: 0, x1: 30, y1: 40 }, z0: 0, z1: 10, frame }
    expect(blankBox(box, [tenon])).toEqual({ profile: { x0: 0, y0: 0, x1: 430, y1: 60 }, z0: 0, z1: 20 })
    expect(blankBox(box, [{ ...tenon, op: 'subtract' }])).toBeNull()
  })

  it('verktyget följer med när värden flyttas eller vrids', () => {
    docs().combine('hål', 'subtract', 'ben1')
    docs().moveInstance('ben1', [100, 0, 0])
    expect(docs().doc.instances.find((i) => i.id === 'hål')!.frame.origin).toEqual([105, 700, -15])
    docs().rotateInstance('ben1', [100, 0, 0], [0, 1, 0], 90)
    // Fortfarande på samma ställe i förhållande till benet.
    expect(bodies()[0]!.tools![0]!.frame.origin.map((x) => Math.round(x))).toEqual([5, 15, 700])
  })

  it('går att lossa, och en värd som tas bort tar sina verktyg med sig', () => {
    docs().combine('hål', 'subtract', 'ben1')
    docs().detach('hål')
    expect(bodies()[2]!.tool).toBeUndefined()
    expect(bodies()[0]!.tools).toBeUndefined()
    expect(docs().selection).toEqual({ kind: 'body', id: 'hål' })

    docs().combine('hål', 'subtract', 'ben1')
    docs().select({ kind: 'body', id: 'ben1' })
    docs().deleteSelection()
    expect(docs().doc.instances.map((i) => i.id)).toEqual(['ben2'])
    docs().undo()
    expect(docs().doc.instances.map((i) => i.id)).toEqual(['ben1', 'ben2', 'hål'])
  })

  it('verktyg på verktyg och delar som skär i sig själva avvisas', () => {
    expect(docs().combine('ben1', 'subtract', 'ben1')).not.toBeNull()
    expect(docs().combine('ben2', 'subtract', 'ben1')).not.toBeNull()
    docs().combine('hål', 'subtract', 'ben1')
    expect(docs().combine('ben2', 'add', 'hål')).not.toBeNull()
    expect(docs().combine('ben1', 'add', 'ben2')).not.toBeNull()
  })
})
