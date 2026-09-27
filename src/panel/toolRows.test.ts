import { describe, expect, it } from 'vitest'
import type { Body, Combine } from '../model/types'
import { toolRows } from './toolRows'

const frame = { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] } as Body['frame']

function body(id: string, name: string, tool?: Combine, size = 20): Body {
  return {
    id,
    defId: `d-${id}`,
    name,
    material: 'ek',
    grainAxis: 'n',
    thicknessAxis: 'u',
    frame,
    profile: { x0: 0, y0: 0, x1: size, y1: size },
    shape: 'circle',
    z0: 0,
    z1: 12,
    ...(tool && { tool }),
  }
}

describe('toolRows', () => {
  const legs = ['b1', 'b2', 'b3', 'b4'].map((id) => body(id, 'Ben'))
  const tenons = legs.map((l, i) => body(`t${i}`, 'Tapp 1', { op: 'joint', host: l.id, into: 'skiva', group: 'g' }))
  const top = body('skiva', 'Skiva')

  it('fyra tapphål i samma grupp blir en rad', () => {
    const rows = toolRows([top, ...legs, ...tenons], 'skiva')
    expect(rows).toEqual([
      {
        ids: ['t0', 't1', 't2', 't3'],
        kind: 'tapphål',
        title: '4 tapphål',
        detail: 'för tapparna på Ben · Ø 20 × 12',
      },
    ])
  })

  it('tappar utan grupp blir en rad var, också när de ser likadana ut', () => {
    const loose = legs.map((l, i) => body(`t${i}`, 'Tapp 1', { op: 'joint', host: l.id, into: 'skiva' }))
    const named = body('t8', 'Mittapp', { op: 'joint', host: 'b1', into: 'skiva' })
    const rows = toolRows([top, ...legs, ...loose, named], 'skiva')
    expect(rows.map((r) => [r.title, r.ids.length])).toEqual([
      ['Tapphål', 1],
      ['Tapphål', 1],
      ['Tapphål', 1],
      ['Tapphål', 1],
      ['Mittapp', 1],
    ])
    expect(rows[4]!.detail).toBe('Tapphål för tappen på Ben · Ø 20 × 12')
  })

  it('på benet: tappen in i skivan', () => {
    const rows = toolRows([top, ...legs, ...tenons], 'b1')
    expect(rows).toEqual([{ ids: ['t0'], kind: 'tapp', title: 'Tapp', detail: 'in i Skiva · Ø 20 × 12' }])
  })
})
