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

  it('på en kvadratisk slå står tapparna i båda ändarna längs benens fiber', () => {
    // Två ben 40 × 40 × 700 med fibern längs höjden, och en slå 400 × 40 × 40 mellan dem.
    const leg = { ...def('ben', 40, 40, 700), grainAxis: 'n' as const, thicknessAxis: 'v' as const }
    docs().load({
      sketches: [],
      params: [],
      defs: [leg, def('slå', 400, 40, 40)],
      instances: [
        { id: 'ben1', defId: 'ben', frame: identity(0, 0, 0) },
        { id: 'ben2', defId: 'ben', frame: identity(440, 0, 0) },
        { id: 'slå', defId: 'slå', frame: identity(40, 0, 300) },
      ],
    })
    const byId = new Map(bodies().map((b) => [b.id, b]))
    const slat = byId.get('slå')!
    for (const id of ['ben1', 'ben2']) {
      const t = tenonFor(slat, byId.get(id)!)
      if (typeof t === 'string') throw new Error(t)
      const long = t.profile.x1 - t.profile.x0 > t.profile.y1 - t.profile.y0 ? t.frame.u : t.frame.v
      // Långsidan lodrät, längs benet: tapphålet går längs fibern.
      expect(Math.abs(long[2])).toBeCloseTo(1)
    }
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

  it('länkade sargar i var sitt ben får en tapp var, inte en per fog', () => {
    const doc = legAndApron()
    docs().load({
      ...doc,
      instances: [
        ...doc.instances,
        { id: 'ben2', defId: 'ben', frame: identity(500, 0, 0) },
        { id: 'sarg2', defId: 'sarg', frame: identity(540, 9, 550) },
      ],
    })
    expect(docs().joint('sarg', 'ben')).toBeNull()
    expect(docs().joint('sarg2', 'ben2')).toBeNull()
    const find = (id: string) => bodies().find((b) => b.id === id)!
    // Båda tapparna hamnar på samma ställe i den delade formen: en gång räcker.
    expect(find('sarg').tools).toHaveLength(1)
    expect(find('sarg2').tools).toBe(find('sarg').tools)
    // Men varje ben har sitt tapphål.
    expect(find('ben').tools).toHaveLength(1)
    expect(find('ben2').tools).toHaveLength(1)
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

describe('tvillingar: tappar från länkade ben in i samma skiva', () => {
  /** Två länkade ben 40×40×700 (längs z) under en skiva 500×100×20 som ligger på deras ändar. */
  function table(): ModelDocument {
    return {
      sketches: [],
      params: [],
      defs: [def('ben', 40, 40, 700), def('skiva', 500, 100, 20)],
      instances: [
        { id: 'ben1', defId: 'ben', frame: identity(0, 0, 0) },
        { id: 'ben2', defId: 'ben', frame: identity(400, 0, 0) },
        { id: 'skiva', defId: 'skiva', frame: identity(-30, -30, 700) },
      ],
    }
  }
  const tenons = () => docs().doc.instances.filter((i) => i.combine?.op === 'joint')
  const tenonOn = (host: string) => bodies().find((b) => b.tool?.host === host)!
  const size = (id: string) => {
    const b = bodies().find((x) => x.id === id)!
    return [b.profile.x1 - b.profile.x0, b.profile.y1 - b.profile.y0, b.z1 - b.z0]
  }

  beforeEach(() => {
    docs().load(table())
    expect(docs().joint('ben1', 'skiva')).toBeNull()
  })

  it('en tapp på ett ben blir en tapp på båda, i en grupp', () => {
    expect(tenons().map((t) => t.combine!.host)).toEqual(['ben1', 'ben2'])
    const [a, b] = tenons()
    expect(a!.combine!.group).toBeDefined()
    expect(a!.combine!.group).toBe(b!.combine!.group)
    expect(docs().joint('ben2', 'skiva')).toBe('ben har redan en tapp i skiva')
  })

  it('ett länkat ben som inte står under skivan får ingen tapp', () => {
    docs().load({
      ...table(),
      instances: table().instances.map((i) => (i.id === 'ben2' ? { ...i, frame: identity(400, 0, -50) } : i)),
    })
    expect(docs().joint('ben1', 'skiva')).toBeNull()
    expect(tenons()).toHaveLength(1)
    expect(tenons()[0]!.combine!.group).toBeUndefined()
  })

  it('ändras måttet på en tapp ändras den andra, och benen har fortfarande en tapp', () => {
    const [a, b] = [tenonOn('ben1').id, tenonOn('ben2').id]
    expect(docs().setExtent(a, 'n', '15')).toBeNull()
    expect(size(b)).toEqual(size(a))
    expect(size(a)[2]).toBe(15)
    // De länkade benen delar form: samma tapp från båda räknas en gång.
    expect(bodies().find((x) => x.id === 'ben1')!.tools).toHaveLength(1)
    // Skivan har två hål, ett för varje ben.
    expect(bodies().find((x) => x.id === 'skiva')!.tools).toHaveLength(2)
  })

  it('flyttas en tapp flyttas den andra lika mycket på sitt ben', () => {
    const [a, b] = [tenonOn('ben1').id, tenonOn('ben2').id]
    const before = docs().doc.instances.find((i) => i.id === b)!.frame.origin
    docs().moveInstance(a, [5, 0, 0])
    expect(docs().doc.instances.find((i) => i.id === b)!.frame.origin).toEqual([before[0]! + 5, before[1], before[2]])
    docs().undo()
    expect(docs().doc.instances.find((i) => i.id === b)!.frame.origin).toEqual(before)
  })

  it('namnet följer med', () => {
    docs().updatePart(tenonOn('ben1').id, { name: 'Dymling' })
    expect(tenonOn('ben2').name).toBe('Dymling')
  })

  it('tas en tapp bort eller lossas, gäller det båda', () => {
    docs().select({ kind: 'body', id: tenonOn('ben1').id })
    docs().deleteSelection()
    expect(tenons()).toHaveLength(0)
    expect(bodies().find((x) => x.id === 'skiva')!.tools).toBeUndefined()
    docs().undo()
    docs().detach(tenonOn('ben2').id)
    expect(tenons()).toHaveLength(0)
    expect(docs().doc.instances).toHaveLength(5)
  })
})
