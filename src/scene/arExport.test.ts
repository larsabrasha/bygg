import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js'
import { Box3, Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { GROUND_FRAME } from '../model/frame'
import { testBody } from '../model/testFixtures'
import { buildArScene, exportUsdz } from './arExport'

describe('buildArScene', () => {
  it('skalar till meter, centrerar golvytan och ställer undersidan på y = 0', () => {
    // 800 × 22 × 120 mm (profil 800 × 120 i golvplanet, 22 mm upp), flyttad bort från origo.
    const b = testBody({ frame: { ...GROUND_FRAME, origin: [1000, 50, -300] } })
    const box = new Box3().setFromObject(buildArScene([b]))
    expect(box.min.y).toBeCloseTo(0)
    expect(box.max.y).toBeCloseTo(0.022)
    expect(box.min.x).toBeCloseTo(-0.4)
    expect(box.max.x).toBeCloseTo(0.4)
    expect(box.min.z).toBeCloseTo(-0.06)
    expect(box.max.z).toBeCloseTo(0.06)
  })

  it('en mesh per del, och delar med samma material delar material', () => {
    const scene = buildArScene([testBody({ id: 'a' }), testBody({ id: 'b' }), testBody({ id: 'c', material: 'ek' })])
    const meshes: Mesh[] = []
    scene.traverse((o) => o instanceof Mesh && meshes.push(o))
    expect(meshes).toHaveLength(3)
    expect(new Set(meshes.map((m) => m.material)).size).toBe(2)
  })

  it('klarar en tom modell', () => {
    expect(() => buildArScene([])).not.toThrow()
  })
})

describe('exportUsdz', () => {
  it('ger ett USDZ-arkiv i meter med model.usda först och en geometri per del', async () => {
    const data = await exportUsdz([testBody({ id: 'a', name: 'Ben' }), testBody({ id: 'b', name: 'Ben' })])
    const files = unzipSync(data)
    expect(Object.keys(files)[0]).toBe('model.usda')
    expect(strFromU8(files['model.usda']!)).toContain('metersPerUnit = 1')
    expect(Object.keys(files).filter((f) => f.startsWith('geometries/'))).toHaveLength(2)
  })
})
