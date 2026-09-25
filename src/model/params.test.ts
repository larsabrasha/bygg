import { describe, expect, it } from 'vitest'
import { applyParams, evaluateParams, isNameUsed } from './params'
import type { ModelDocument, Param, PartDef } from './types'

const p = (name: string, expr: string): Param => ({ id: name, name, expr, value: 0 })

const def = (overrides: Partial<PartDef> = {}): PartDef => ({
  id: 'd1',
  name: 'Del 1',
  material: 'furu',
  grainAxis: 'u',
  thicknessAxis: 'n',
  profile: { x0: 0, y0: 0, x1: 800, y1: 120 },
  z0: 0,
  z1: 22,
  ...overrides,
})

const doc = (params: Param[], defs: PartDef[]): ModelDocument => ({ sketches: [], defs, instances: [], params })

describe('evaluateParams', () => {
  it('beräknar parametrar som refererar till varandra, i valfri ordning', () => {
    const r = evaluateParams([p('inner', 'bredd - 2 * t'), p('bredd', '600'), p('t', '22')])
    expect(r.get('inner')).toEqual({ ok: true, value: 556 })
  })

  it('upptäcker cirkelreferenser', () => {
    const r = evaluateParams([p('a', 'b + 1'), p('b', 'a + 1')])
    expect(r.get('a')?.ok).toBe(false)
    expect(r.get('b')?.ok).toBe(false)
  })

  it('felet sprids till beroende parametrar', () => {
    const r = evaluateParams([p('a', 'saknas'), p('b', 'a * 2')])
    expect(r.get('b')).toEqual({ ok: false, error: 'Okänd parameter "saknas"' })
  })
})

describe('applyParams', () => {
  it('räknar om mått som styrs av uttryck och håller anchor-sidan still', () => {
    const d = def({
      dims: { n: { expr: 't', anchor: 'min' }, u: { expr: 'l', anchor: 'max' } },
    })
    const out = applyParams(doc([p('t', '18'), p('l', '500')], [d]))
    expect(out.defs[0]).toMatchObject({ z0: 0, z1: 18, profile: { x0: 300, x1: 800 } })
    expect(out.params.map((x) => x.value)).toEqual([18, 500])
  })

  it('lämnar måttet orört om uttrycket inte går att beräkna eller blir för litet', () => {
    const d = def({ dims: { n: { expr: 'saknas', anchor: 'min' }, u: { expr: '0', anchor: 'min' } } })
    expect(applyParams(doc([], [d])).defs[0]).toBe(d)
  })

  it('behåller samma objekt när inget ändras', () => {
    const d = def({ dims: { n: { expr: '22', anchor: 'min' } } })
    expect(applyParams(doc([], [d])).defs[0]).toBe(d)
  })
})

describe('isNameUsed', () => {
  it('hittar namn i parametrar och mått', () => {
    const d = def({ dims: { n: { expr: 't', anchor: 'min' } } })
    expect(isNameUsed(doc([p('a', 'b * 2')], [d]), 'b')).toBe(true)
    expect(isNameUsed(doc([], [d]), 't')).toBe(true)
    expect(isNameUsed(doc([], [d]), 'x')).toBe(false)
  })
})
