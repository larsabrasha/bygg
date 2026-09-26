import Module, { type ManifoldToplevel } from 'manifold-3d'
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js'
import { Box3, BoxGeometry, Mesh, MeshStandardMaterial, Texture, Vector3 } from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { GROUND_FRAME } from '../model/frame'
import { testBody } from '../model/testFixtures'
import type { Frame, ToolShape, Vec3 } from '../model/types'
import { buildArScene, exportUsdz, groupEndGrain } from './arExport'
import { UV_MM } from './grainUv'
import type { Wood } from './woodTexture'

const meshesOf = (scene: ReturnType<typeof buildArScene>) => {
  const meshes: Mesh[] = []
  scene.traverse((o) => o instanceof Mesh && meshes.push(o))
  return meshes
}

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

  it('har centreringen i modellens matris, som exporten läser utan att räkna om den', () => {
    // USDZExporter tar object.matrix som den är. Samma del som ovan: golvytans mitt i (1,4; 0,05; −0,36) m.
    const b = testBody({ frame: { ...GROUND_FRAME, origin: [1000, 50, -300] } })
    const model = buildArScene([b]).children[0]!
    const t = new Vector3().setFromMatrixPosition(model.matrix)
    expect(t.x).toBeCloseTo(-1.4)
    expect(t.y).toBeCloseTo(-0.05)
    expect(t.z).toBeCloseTo(0.36)
  })

  it('en mesh per del, och delar med samma material delar material', () => {
    const scene = buildArScene([testBody({ id: 'a' }), testBody({ id: 'b' }), testBody({ id: 'c', material: 'ek' })])
    const meshes = meshesOf(scene)
    expect(meshes).toHaveLength(3)
    expect(new Set(meshes.map((m) => m.material)).size).toBe(2)
  })

  it('tar inte med verktygen: ett hål blev annars en massiv låda i hålet', () => {
    const hole = testBody({ id: 't', tool: { op: 'subtract', host: 'a' } })
    expect(meshesOf(buildArScene([testBody({ id: 'a', name: 'Skiva' }), hole])).map((m) => m.name)).toEqual(['Skiva'])
  })

  it('klarar en tom modell', () => {
    expect(() => buildArScene([])).not.toThrow()
  })
})

describe('groupEndGrain', () => {
  it('lägger ändarna (fibern rakt ut) sist, i en egen grupp', () => {
    const g = new BoxGeometry(800, 22, 120)
    groupEndGrain(g, 0)
    // Två sidor av sex är ändar, två trianglar var.
    expect(g.groups).toEqual([
      { start: 0, count: 24, materialIndex: 0 },
      { start: 24, count: 12, materialIndex: 1 },
    ])
    const normal = g.getAttribute('normal')
    const index = g.getIndex()!
    for (let i = 24; i < 36; i++) expect(Math.abs(normal.getX(index.getX(i)))).toBe(1)
    for (let i = 0; i < 24; i++) expect(normal.getX(index.getX(i))).toBe(0)
  })
})

describe('buildArScene med trätextur', () => {
  // Som woodTexture: bilden är 740 mm stor och upprepas per UV_MM.
  const texture = () => {
    const t = new Texture()
    t.repeat.set(UV_MM / 740, UV_MM / 740)
    return t
  }
  const wood: Wood = { map: texture(), normalMap: texture() }
  const woods = new Map([['furu', wood]])

  it('ger texturkoordinater med upprepningen i sig, och texturer utan upprepning som sparas som JPEG', () => {
    const [mesh] = meshesOf(buildArScene([testBody()], { woods }))
    const uv = mesh!.geometry.getAttribute('uv')
    expect(uv).toBeDefined()
    // Längs fibern (u, 800 mm) spänner koordinaterna 800 mm i bildens storlek.
    const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i))
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(800 / 740)
    const [side] = mesh!.material as MeshStandardMaterial[]
    expect(side!.map!.repeat.toArray()).toEqual([1, 1])
    expect(side!.map!.userData.mimeType).toBe('image/jpeg')
    expect(side!.map!.source).toBe(wood.map.source)
    expect(side!.normalMap!.source).toBe(wood.normalMap.source)
  })

  it('har mörkare ändträ och en egen ton per del, men delar bilderna', () => {
    const meshes = meshesOf(buildArScene([testBody({ id: 'a' }), testBody({ id: 'b' })], { woods }))
    const [a, b] = meshes.map((m) => m.material as MeshStandardMaterial[])
    expect(a).toHaveLength(2)
    expect(a![1]!.color.g).toBeLessThan(a![0]!.color.g)
    expect(a![0]!.color.equals(b![0]!.color)).toBe(false)
    expect(a![0]!.map).toBe(b![0]!.map)
  })

  it('material utan laddad textur blir enfärgade', () => {
    const [mesh] = meshesOf(buildArScene([testBody({ material: 'ek' })], { woods }))
    expect(mesh!.material).toBeInstanceOf(MeshStandardMaterial)
    expect(mesh!.geometry.getAttribute('uv').count).toBeGreaterThan(0) // BoxGeometrys egna
    expect(Array.isArray(mesh!.material)).toBe(false)
  })
})

describe('buildArScene med verktyg', () => {
  let manifold: ManifoldToplevel
  beforeAll(async () => {
    manifold = await Module()
    manifold.setup()
  })

  const at = (origin: Vec3): Frame => ({ origin, u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] })
  // En tapp 30 mm ut från delens ände (u = 800), i delens koordinater.
  const tenon: ToolShape = {
    op: 'add',
    profile: { x0: 0, y0: 0, x1: 30, y1: 60 },
    z0: 0,
    z1: 10,
    frame: at([800, 30, 6]),
  }
  const hole: ToolShape = {
    op: 'subtract',
    profile: { x0: 0, y0: 0, x1: 20, y1: 20 },
    z0: 0,
    z1: 22,
    frame: at([100, 50, 0]),
  }

  it('ritar resultatet med verktygen: en tapp som sticker ut gör modellen längre', () => {
    const box = new Box3().setFromObject(buildArScene([testBody({ tools: [tenon] })], { manifold }))
    expect(box.max.x - box.min.x).toBeCloseTo(0.83)
    expect(box.min.y).toBeCloseTo(0)
  })

  it('ett hål ger fler trianglar än lådan, och cachens geometri ändras inte', () => {
    const b = testBody({ tools: [hole] })
    const [mesh] = meshesOf(
      buildArScene([b], { manifold, woods: new Map([['furu', { map: new Texture(), normalMap: new Texture() }]]) }),
    )
    expect(mesh!.geometry.getIndex()!.count / 3).toBeGreaterThan(12)
    const [again] = meshesOf(buildArScene([b], { manifold }))
    expect(again!.geometry.getAttribute('uv')).toBeUndefined()
    expect(again!.geometry.groups).toHaveLength(0)
  })

  it('utan manifold blir delen utan verktyg', () => {
    const box = new Box3().setFromObject(buildArScene([testBody({ tools: [tenon] })]))
    expect(box.max.x - box.min.x).toBeCloseTo(0.8)
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

  it('skriver centreringen i filen', async () => {
    const b = testBody({ frame: { ...GROUND_FRAME, origin: [1000, 50, -300] } })
    const usda = strFromU8(unzipSync(await exportUsdz([b]))['model.usda']!)
    // Modellens Xform: skalan till meter och flytten till mitten (sista raden i matrisen).
    expect(usda).toMatch(/\(-1\.4\d*, -0\.05\d*, 0\.36\d*, 1\)/)
  })
})
