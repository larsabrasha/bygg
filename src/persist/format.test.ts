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
