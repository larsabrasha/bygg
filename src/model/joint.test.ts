import { beforeEach, describe, expect, it } from 'vitest'
import { resetDocumentStore, useDocumentStore } from '../store/documentStore'
import { buildCutList } from './cutlist'
import { tenonFor } from './joint'
import { resolveBodies } from './resolve'
import type { Frame, ModelDocument, PartDef } from './types'

const docs = () => useDocumentStore.getState()
const bodies = () => resolveBodies(docs().doc)
const identity = (x: number, y: number, z: number): Frame => ({
  origin: [x, y, z],
  u: [1, 0, 0],
  v: [0, 1, 0],
  n: [0, 0, 1],
})
const def = (id: string, x1: number, y1: number, z1: number): PartDef => ({
  id,
  name: id,
  material: 'ek',
  grainAxis: 'u',
  thicknessAxis: 'v',
  profile: { x0: 0, y0: 0, x1, y1 },
  z0: 0,
  z1,
})

/** Ett ben 40×40×700 (står längs z) och en sarg 400×22×100 som ligger an mot benets sida vid x = 40. */
function legAndApron(gap = 0): ModelDocument {
  return {
    sketches: [],
    params: [],
    defs: [def('ben', 40, 40, 700), def('sarg', 400, 22, 100)],
    instances: [
      { id: 'ben', defId: 'ben', frame: identity(0, 0, 0) },
      { id: 'sarg', defId: 'sarg', frame: identity(40 + gap, 9, 550) },
    ],
  }
}

beforeEach(() => {
  resetDocumentStore()
  docs().load(legAndApron())
})

describe('tapp och tapphål', () => {
  it('tappen sitter mitt på änden som ligger an, med tumreglernas mått', () => {
    const [leg, apron] = bodies()
    const t = tenonFor(apron!, leg!)
    if (typeof t === 'string') throw new Error(t)
    // Änden vid x = 40 pekar mot benet (−x). Sargen är 22 tjock och 100 hög.
    expect(t.frame.n.map((x) => x + 0)).toEqual([-1, 0, 0])
    const w = t.profile.x1 - t.profile.x0
    const h = t.profile.y1 - t.profile.y0
    // En tredjedel av 22 ≈ 7, och 100 minus en ansats på 10 på var sida = 80. Två tredjedelar av 40 ≈ 27.
    expect([Math.min(w, h), Math.max(w, h)]).toEqual([7, 80])
    expect(t.depth).toBe(27)
  })

  it('går inte om delarna inte ligger an', () => {
    docs().load(legAndApron(30))
    expect(docs().joint('sarg', 'ben')).toMatch(/ligga an/)
  })

  it('en tapp läggs till på sargen och skärs ut ur benet; ämnet blir längre', () => {
    expect(docs().joint('sarg', 'ben')).toBeNull()
    const [leg, apron, tenon] = bodies()
    expect(tenon).toMatchObject({ name: 'Tapp 1', tool: { op: 'joint', host: 'sarg', into: 'ben' } })
    expect(apron!.tools).toEqual([expect.objectContaining({ op: 'add' })])
    expect(leg!.tools).toEqual([expect.objectContaining({ op: 'subtract' })])
    const list = buildCutList(bodies())
    expect(list.totalCount).toBe(2)
    // Sargen: 400 + 27 lång tapp.
    expect(list.rows.find((r) => r.names.includes('sarg'))).toMatchObject({ length: 427 })
    expect(docs().selection).toEqual({ kind: 'body', id: 'sarg' })
  })

  it('tas benet bort blir tappen ett vanligt tillägg på sargen', () => {
    docs().joint('sarg', 'ben')
    docs().select({ kind: 'body', id: 'ben' })
    docs().deleteSelection()
    expect(bodies().find((b) => b.name === 'Tapp 1')!.tool).toEqual({ op: 'add', host: 'sarg' })
  })

  it('tapphålet hamnar bara i benet tappen går in i, inte i dess länkade kopior', () => {
    const doc = legAndApron()
    docs().load({ ...doc, instances: [...doc.instances, { id: 'ben2', defId: 'ben', frame: identity(500, 0, 0) }] })
    expect(docs().joint('sarg', 'ben')).toBeNull()
    const leg = bodies().find((b) => b.id === 'ben')!
    const copy = bodies().find((b) => b.id === 'ben2')!
    expect(leg.tools).toEqual([expect.objectContaining({ op: 'subtract' })])
    expect(copy.tools).toBeUndefined()
    // Kaplistan räknar dem ändå som samma del.
    expect(buildCutList(bodies()).rows.find((r) => r.names.includes('ben'))).toMatchObject({ count: 2 })
  })

  it('tappen finns på alla länkade kopior av sargen', () => {
    const doc = legAndApron()
    docs().load({ ...doc, instances: [...doc.instances, { id: 'sarg2', defId: 'sarg', frame: identity(40, 9, 100) }] })
    docs().joint('sarg', 'ben')
    const [a, b] = ['sarg', 'sarg2'].map((id) => bodies().find((x) => x.id === id)!)
    expect(a!.tools).toEqual([expect.objectContaining({ op: 'add' })])
    expect(b!.tools).toBe(a!.tools)
  })

  describe('tappen följer sargen och benet', () => {
    const tenonSize = () => {
      const t = bodies().find((b) => b.name === 'Tapp 1')!
      const w = t.profile.x1 - t.profile.x0
      const h = t.profile.y1 - t.profile.y0
      return [Math.min(w, h), Math.max(w, h), t.z1 - t.z0]
    }

    it('blir sargen tjockare räknas tappen om med tumreglerna', () => {
      docs().joint('sarg', 'ben')
      expect(tenonSize()).toEqual([7, 80, 27])
      expect(docs().setExtent('sarg', 'v', '30')).toBeNull()
      // En tredjedel av 30 = 10; ansatsen och djupet som förut.
      expect(tenonSize()).toEqual([10, 80, 27])
      // Tapphålet i benet följer tappen.
      expect(bodies().find((b) => b.id === 'ben')!.tools![0]!.profile).toEqual(
        bodies().find((b) => b.name === 'Tapp 1')!.profile,
      )
    })

    it('en egen ändring av tappen ligger kvar tills sargen eller benet ändras', () => {
      docs().joint('sarg', 'ben')
      const tapp = docs().doc.instances.find((i) => i.combine)!.id
      expect(docs().setExtent(tapp, 'n', '20')).toBeNull()
      expect(tenonSize()[2]).toBe(20)
      // Namnet påverkar inte var tappen sitter.
      docs().updatePart('sarg', { name: 'Framsarg' })
      expect(tenonSize()[2]).toBe(20)
      docs().setExtent('sarg', 'v', '30')
      expect(tenonSize()).toEqual([10, 80, 27])
    })

    it('ligger delarna inte längre an behålls tappen och följer sargen', () => {
      docs().joint('sarg', 'ben')
      docs().moveInstance('sarg', [100, 0, 0])
      expect(tenonSize()).toEqual([7, 80, 27])
      const t = bodies().find((b) => b.name === 'Tapp 1')!
      expect(t.frame.origin[0]).toBeCloseTo(140)
    })
  })
})
