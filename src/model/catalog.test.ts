import { afterEach, describe, expect, it } from 'vitest'
import {
  cleanCatalog,
  emptyCatalog,
  embedMaterials,
  mergeCatalogs,
  BUILT_IN_COLORS,
  paintChoices,
  parseSheets,
  parseThicknesses,
  specOf,
  type Catalog,
  type CatalogMaterial,
} from './catalog'
import { buildCutPlan } from './cutPlan'
import { materialSpec, setCustomMaterials } from './materials'
import { emptyDoc, testBody } from './testFixtures'
import type { ModelDocument } from './types'

const valchromat: CatalogMaterial = {
  id: 'v1',
  name: 'Valchromat',
  kind: 'sheet',
  grain: false,
  thicknesses: [8, 12, 19],
  sheets: [{ length: 2440, width: 1830 }],
  color: '#334455',
  updatedAt: '2026-09-27T10:00:00Z',
}
const color = (id: string, updatedAt: string, name = id) => ({ id, name, color: '#112233', updatedAt })
const catalog = (patch: Partial<Catalog>): Catalog => ({ ...emptyCatalog(), ...patch })

afterEach(() => setCustomMaterials([]))

describe('egna material', () => {
  it('slås upp som de inbyggda, och räknas i kapschemat med sina skivmått', () => {
    setCustomMaterials([valchromat])
    expect(materialSpec('v1').name).toBe('Valchromat')
    const plan = buildCutPlan([testBody({ material: 'v1', profile: { x0: 0, y0: 0, x1: 900, y1: 400 }, z1: 19 })])
    expect(plan.groups[0]).toMatchObject({ sheet: true, stocks: [{ stock: { length: 2440, width: 1830 } }] })
  })

  it('kan inte ta ett inbyggts id', () => {
    setCustomMaterials([{ ...valchromat, id: 'mdf' }])
    expect(materialSpec('mdf').name).toBe('MDF')
  })
})

describe('embedMaterials', () => {
  const doc = (material: string, materials?: ModelDocument['materials']): ModelDocument => ({
    ...emptyDoc(),
    defs: [
      {
        id: 'd',
        name: 'Sida',
        material,
        grainAxis: 'u',
        thicknessAxis: 'n',
        profile: { x0: 0, y0: 0, x1: 1, y1: 1 },
        z0: 0,
        z1: 1,
      },
    ],
    ...(materials && { materials }),
  })

  it('sparar en kopia av ett eget material som används, utan listans tidsstämpel', () => {
    setCustomMaterials([specOf(valchromat)])
    expect(embedMaterials(doc('v1')).materials).toEqual([expect.not.objectContaining({ updatedAt: expect.anything() })])
    expect(embedMaterials(doc('v1')).materials![0]!.name).toBe('Valchromat')
  })

  it('behåller modellens kopia när materialet inte finns i listan, och tar bort oanvända', () => {
    const copy = { ...valchromat, name: 'Gammal' }
    expect(embedMaterials(doc('v1', [copy])).materials![0]!.name).toBe('Gammal')
    expect(embedMaterials(doc('furu', [copy]))).not.toHaveProperty('materials')
  })

  it('ger samma dokument när inget ändras', () => {
    const d = doc('furu')
    expect(embedMaterials(d)).toBe(d)
  })
})

describe('mergeCatalogs', () => {
  it('behåller poster från båda, och den senast ändrade av samma post', () => {
    const a = catalog({ colors: [color('c1', '2026-09-27T10:00:00Z', 'Gammal'), color('c2', '2026-09-27T10:00:00Z')] })
    const b = catalog({ colors: [color('c1', '2026-09-27T11:00:00Z', 'Ny'), color('c3', '2026-09-27T10:00:00Z')] })
    const merged = mergeCatalogs(a, b)
    expect(merged.colors.map((c) => c.name).sort()).toEqual(['Ny', 'c2', 'c3'])
    // Samma poster åt båda hållen; ordningen följer den första listan.
    const ids = (c: Catalog) => c.colors.map((x) => `${x.id} ${x.name}`).sort()
    expect(ids(mergeCatalogs(b, a))).toEqual(ids(merged))
  })

  it('en borttagning vinner över en äldre version, men inte över en nyare', () => {
    const removed = catalog({ removed: { c1: '2026-09-27T11:00:00Z' } })
    expect(mergeCatalogs(catalog({ colors: [color('c1', '2026-09-27T10:00:00Z')] }), removed).colors).toEqual([])
    expect(mergeCatalogs(catalog({ colors: [color('c1', '2026-09-27T12:00:00Z')] }), removed).colors).toHaveLength(1)
  })

  it('tar de dolda materialen från den som ändrade dem senast', () => {
    const a = catalog({ hidden: ['ek'], hiddenAt: '2026-09-27T10:00:00Z' })
    const b = catalog({ hidden: ['ek', 'ask'], hiddenAt: '2026-09-27T11:00:00Z' })
    expect(mergeCatalogs(a, b).hidden).toEqual(['ek', 'ask'])
    expect(mergeCatalogs(b, a).hidden).toEqual(['ek', 'ask'])
  })
})

describe('cleanCatalog', () => {
  it('ger en tom lista för skräp, och sorterar tjocklekarna', () => {
    expect(cleanCatalog('skräp')).toEqual(emptyCatalog())
    const clean = cleanCatalog({ materials: [{ ...valchromat, thicknesses: [19, 8, -1, 8] }] })
    expect(clean.materials[0]!.thicknesses).toEqual([8, 19])
  })
})

describe('tolkningen av det man skriver', () => {
  it('läser tjocklekar med decimalkomma, mellanslag och semikolon', () => {
    expect(parseThicknesses('4, 6,5, 9')).toEqual([4, 6.5, 9])
    expect(parseThicknesses('19 12;16 12 x')).toEqual([12, 16, 19])
    expect(parseThicknesses('')).toEqual([])
  })

  it('läser skivmått med × eller x', () => {
    expect(parseSheets('2440 × 1220, 2500x1250')).toEqual([
      { length: 2440, width: 1220 },
      { length: 2500, width: 1250 },
    ])
    expect(parseSheets('stor')).toEqual([])
  })
})

describe('paintChoices', () => {
  it('standardfärgerna på en rad, modellens övriga på en annan, var och en bara en gång', () => {
    const saved = catalog({
      hidden: BUILT_IN_COLORS.slice(1).map((c) => c.id),
      colors: [{ id: 'c1', name: 'Monterblå', color: '#2f4a5c', code: 'NCS S 7020-B', updatedAt: 't' }],
    })
    const doc: ModelDocument = {
      ...emptyDoc(),
      defs: [
        { ...testDef('a'), paint: { color: '#2f4a5c', code: 'NCS S 7020-B' } },
        { ...testDef('b'), paint: { color: '#123456' } },
        { ...testDef('c'), paint: { color: '#123456' } },
      ],
    }
    const { standard, model } = paintChoices(saved, doc)
    expect(standard.map((c) => c.name)).toEqual([BUILT_IN_COLORS[0]!.name, 'Monterblå'])
    expect(model.map((c) => c.paint)).toEqual([{ color: '#123456' }])
  })
})

function testDef(id: string) {
  return {
    id,
    name: id,
    material: 'mdf',
    grainAxis: 'u' as const,
    thicknessAxis: 'n' as const,
    profile: { x0: 0, y0: 0, x1: 1, y1: 1 },
    z0: 0,
    z1: 1,
  }
}
