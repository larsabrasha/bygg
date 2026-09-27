import { describe, expect, it } from 'vitest'
import { GROUND_FRAME } from '../model/frame'
import type { ModelDocument } from '../model/types'
import { FORMAT_VERSION, migrate, serialize } from './format'

const doc: ModelDocument = {
  sketches: [{ id: 's', frame: GROUND_FRAME, rect: { x0: 0, y0: 0, x1: 10, y1: 10 } }],
  defs: [
    {
      id: 'd',
      name: 'Del 1',
      material: 'ek',
      grainAxis: 'u',
      thicknessAxis: 'n',
      profile: { x0: 0, y0: 0, x1: 800, y1: 120 },
      z0: 0,
      z1: 22,
    },
  ],
  instances: [{ id: 'i', defId: 'd', frame: GROUND_FRAME }],
  params: [{ id: 'p', name: 't', expr: '22', value: 22 }],
}

describe('format', () => {
  it('läser ett verktyg och avvisar en okänd operation', () => {
    const tool = {
      ...doc,
      instances: [
        ...doc.instances,
        { id: 't', defId: 'd', frame: GROUND_FRAME, combine: { op: 'subtract' as const, host: 'i' } },
      ],
    }
    expect(migrate(JSON.parse(JSON.stringify(serialize(tool))))).toEqual({ ok: true, doc: tool })
    const odd = { ...doc, instances: [{ ...doc.instances[0]!, combine: { op: 'glue', host: 'i' } }] }
    expect(migrate({ version: FORMAT_VERSION, savedAt: '', doc: odd }).ok).toBe(false)
  })

  it('läser en cylinder och avvisar en okänd form', () => {
    const round = { ...doc, defs: [{ ...doc.defs[0]!, shape: 'circle' as const }] }
    expect(migrate(JSON.parse(JSON.stringify(serialize(round))))).toEqual({ ok: true, doc: round })
    const odd = { ...doc, defs: [{ ...doc.defs[0]!, shape: 'hexagon' }] }
    expect(migrate({ version: FORMAT_VERSION, savedAt: '', doc: odd }).ok).toBe(false)
  })

  it('läser tillbaka det som sparats, även efter JSON (som IndexedDB-kloning)', () => {
    const saved = JSON.parse(JSON.stringify(serialize(doc, new Date('2026-09-25T12:00:00Z'))))
    expect(saved.version).toBe(FORMAT_VERSION)
    expect(migrate(saved)).toEqual({ ok: true, doc })
  })

  it('konverterar version 1, där fibern var längs längsta eller näst längsta måttet', () => {
    const v1def = (grain: string) => ({
      id: 'd',
      name: 'Del 1',
      material: 'ek',
      grain,
      // 22 längs u, 800 längs v, 120 längs n: en stående bräda.
      profile: { x0: 0, y0: 0, x1: 22, y1: 800 },
      z0: 0,
      z1: 120,
    })
    const v1 = (grain: string) => ({ version: 1, doc: { ...doc, defs: [v1def(grain)] } })
    const along = migrate(v1('length'))
    const across = migrate(v1('width'))
    expect(along.ok && along.doc.defs[0]).toMatchObject({ grainAxis: 'v', thicknessAxis: 'u' })
    expect(across.ok && across.doc.defs[0]).toMatchObject({ grainAxis: 'n', thicknessAxis: 'u' })
    expect(along.ok && 'grain' in along.doc.defs[0]!).toBe(false)
  })

  it('läser version 2 utan konvertering, och läge som uttryck (version 3)', () => {
    expect(migrate({ version: 2, doc })).toEqual({ ok: true, doc })
    const withPos = { ...doc, instances: [{ ...doc.instances[0]!, pos: { y: 't * 2' } }] }
    expect(migrate(JSON.parse(JSON.stringify(serialize(withPos))))).toEqual({ ok: true, doc: withPos })
    const bad = { ...doc, instances: [{ ...doc.instances[0]!, pos: { y: 5 } }] }
    expect(migrate({ version: FORMAT_VERSION, doc: bad }).ok).toBe(false)
  })

  it('läser viloläge för vinklar (version 4) och avvisar ett trasigt', () => {
    const rest = { u: [0, 0, -1], v: [-1, 0, 0], n: [0, 1, 0] }
    const withRest = { ...doc, instances: [{ ...doc.instances[0]!, rest }] } as typeof doc
    expect(migrate(JSON.parse(JSON.stringify(serialize(withRest))))).toEqual({ ok: true, doc: withRest })
    const bad = { ...doc, instances: [{ ...doc.instances[0]!, rest: { u: [0, 0] } }] }
    expect(migrate({ version: FORMAT_VERSION, doc: bad }).ok).toBe(false)
  })

  it('avvisar samma axel för fiber och tjocklek', () => {
    const bad = { ...doc, defs: [{ ...doc.defs[0]!, grainAxis: 'n', thicknessAxis: 'n' }] }
    expect(migrate({ version: FORMAT_VERSION, doc: bad }).ok).toBe(false)
  })

  it('avvisar nyare version', () => {
    expect(migrate({ version: FORMAT_VERSION + 1, doc })).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/nyare/),
    })
  })

  it.each([null, 'text', {}, { version: 1 }, { version: 1, doc: { ...doc, instances: [{ id: 'i' }] } }])(
    'avvisar trasig data %#',
    (raw) => {
      expect(migrate(raw).ok).toBe(false)
    },
  )
})

describe('lagermått', () => {
  it('läser lagermått och sågblad', () => {
    const withStock = {
      ...doc,
      stock: {
        kerf: 2.5,
        lengthAllowance: 20,
        noLeftover: ['ek|22'],
        sizes: {
          'ek|22': [
            { length: 2400, width: 145, trim: 25 },
            { length: 2400, width: 600 },
          ],
        },
      },
    }
    expect(migrate(JSON.parse(JSON.stringify(serialize(withStock))))).toEqual({ ok: true, doc: withStock })
  })

  it('läser ett ensamt lagermått (som det först sparades) som en lista med ett', () => {
    const old = { ...doc, stock: { sizes: { 'ek|22': { length: 2400, width: 145 } } } }
    expect(migrate({ version: FORMAT_VERSION, savedAt: '', doc: old })).toEqual({
      ok: true,
      doc: { ...doc, stock: { sizes: { 'ek|22': [{ length: 2400, width: 145 }] } } },
    })
  })

  it('släpper trasiga lagermått men läser modellen', () => {
    const broken = {
      ...doc,
      stock: {
        kerf: -1,
        lengthAllowance: 'mycket',
        noLeftover: [3, null],
        sizes: {
          'ek|22': { length: 'lång', width: 145 },
          'ek|28': { length: 2400, width: 145, trim: -5 },
          'ek|18': [
            { length: 2400, width: 600 },
            { length: 0, width: 95 },
          ],
        },
      },
    }
    expect(migrate({ version: FORMAT_VERSION, savedAt: '', doc: broken })).toEqual({
      ok: true,
      doc: { ...doc, stock: { sizes: { 'ek|18': [{ length: 2400, width: 600 }] } } },
    })
    expect(migrate({ version: FORMAT_VERSION, savedAt: '', doc: { ...doc, stock: 'x' } })).toEqual({ ok: true, doc })
  })

  it('version 7: tappar från länkade ben in i samma skiva får en grupp, andra inte', () => {
    const at = (x: number, y: number, z: number) => ({ ...GROUND_FRAME, origin: [x, y, z] as [number, number, number] })
    const part = (id: string) => ({ ...doc.defs[0]!, id, name: id })
    const joint = (host: string, into = 'skiva') => ({ op: 'joint' as const, host, into })
    const old: ModelDocument = {
      ...doc,
      defs: [part('ben'), part('skiva'), part('t1'), part('t2'), part('t3')],
      instances: [
        { id: 'ben1', defId: 'ben', frame: at(0, 0, 0) },
        { id: 'ben2', defId: 'ben', frame: at(500, 0, 0) },
        { id: 'skiva', defId: 'skiva', frame: at(0, 700, 0) },
        // Samma ställe på var sitt ben: en grupp. Den tredje sitter på ett annat ställe.
        { id: 'a', defId: 't1', frame: at(10, 700, 5), combine: joint('ben1') },
        { id: 'b', defId: 't2', frame: at(510, 700, 5), combine: joint('ben2') },
        { id: 'c', defId: 't3', frame: at(520, 700, 5), combine: joint('ben2') },
      ],
    }
    const r = migrate({ version: 7, doc: old })
    if (!r.ok) throw new Error(r.reason)
    const group = (id: string) => r.doc.instances.find((i) => i.id === id)!.combine!.group
    expect(group('a')).toBeDefined()
    expect(group('b')).toBe(group('a'))
    expect(group('c')).toBeUndefined()
    // En fil i nuvarande format ändras inte: där är grupperna uttryckliga.
    expect(migrate({ version: FORMAT_VERSION, doc: old })).toEqual({ ok: true, doc: old })
  })
})
