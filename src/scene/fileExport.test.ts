import Module, { type ManifoldToplevel } from 'manifold-3d'
import { Box3, BufferAttribute, BufferGeometry, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { GROUND_FRAME } from '../model/frame'
import { testBody } from '../model/testFixtures'
import type { Frame, ToolShape, Vec3 } from '../model/types'
import { closedMesh, export3mf, exportGlb, exportObj, exportStl, partMeshes } from './fileExport'

const at = (origin: Vec3): Frame => ({ origin, u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] })

// 800 × 22 × 120 mm, liggande på golvet (22 mm upp), flyttad bort från origo.
const board = testBody({ id: 'a', name: 'Skiva', frame: { ...GROUND_FRAME, origin: [1000, 50, -300] } })
/** En likadan del ovanpå: tillsammans 44 mm höga. */
const onTop = (name = 'Del 2', material = 'furu') =>
  testBody({ id: 'b', name, material, frame: { ...GROUND_FRAME, origin: [1000, 72, -300] } })

/** Sluten och vänd åt samma håll: varje kant finns en gång åt varje håll. */
function expectClosed({ triangles }: { triangles: Uint32Array }) {
  const edges = new Map<string, number>()
  for (let t = 0; t < triangles.length; t += 3)
    for (let k = 0; k < 3; k++) {
      const key = `${triangles[t + k]}>${triangles[t + ((k + 1) % 3)]}`
      edges.set(key, (edges.get(key) ?? 0) + 1)
    }
  for (const [key, count] of edges) {
    expect(count, key).toBe(1)
    const [a, b] = key.split('>')
    expect(edges.get(`${b}>${a}`), key).toBe(1)
  }
}

function boxOf(positions: ArrayLike<number>) {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(Float32Array.from(positions), 3))
  g.computeBoundingBox()
  return g.boundingBox!
}

describe('partMeshes', () => {
  it('i millimeter, mitt på golvet, med z uppåt och framsidan mot −y', () => {
    const [part] = partMeshes([board], {}, 'z')
    const box = boxOf(part!.geometry.getAttribute('position').array)
    expect(box.min.toArray().map((x) => Math.round(x))).toEqual([-400, -60, 0])
    expect(box.max.toArray().map((x) => Math.round(x))).toEqual([400, 60, 22])
  })

  it('med y uppåt som i appen', () => {
    const [part] = partMeshes([board], {}, 'y')
    const box = boxOf(part!.geometry.getAttribute('position').array)
    expect(box.max.y).toBeCloseTo(22)
    expect(box.max.z).toBeCloseTo(60)
  })

  it('tar inte med verktygen, som redan finns i delen de sitter på', () => {
    const tool = testBody({ id: 't', name: 'Hål', tool: { op: 'subtract', host: 'a' } })
    expect(partMeshes([board, tool], {}, 'z').map((p) => p.name)).toEqual(['Skiva'])
  })

  it('har delens namn och material', () => {
    const [part] = partMeshes([testBody({ name: 'Ben', material: 'ek' })], {}, 'z')
    expect(part).toMatchObject({ name: 'Ben', material: 'ek' })
  })
})

describe('closedMesh', () => {
  it('en låda blir 8 hörn och 12 trianglar, sluten', () => {
    const [part] = partMeshes([board], {}, 'z')
    const mesh = closedMesh(part!.geometry)
    expect(mesh.vertices.length / 3).toBe(8)
    expect(mesh.triangles.length / 3).toBe(12)
    expectClosed(mesh)
  })

  it('en cylinder blir sluten', () => {
    const rod = testBody({ shape: 'circle', profile: { x0: 0, y0: 0, x1: 30, y1: 30 }, z0: 0, z1: 500 })
    expectClosed(closedMesh(partMeshes([rod], {}, 'z')[0]!.geometry))
  })

  describe('med verktyg', () => {
    let manifold: ManifoldToplevel
    beforeAll(async () => {
      manifold = await Module()
      manifold.setup()
    })

    it('en del med hål och tapp blir sluten, och tappen sticker ut', () => {
      const hole: ToolShape = {
        op: 'subtract',
        profile: { x0: 0, y0: 0, x1: 20, y1: 20 },
        z0: 0,
        z1: 22,
        frame: at([100, 50, 0]),
      }
      const tenon: ToolShape = {
        op: 'add',
        profile: { x0: 0, y0: 0, x1: 30, y1: 60 },
        z0: 0,
        z1: 10,
        frame: at([800, 30, 6]),
      }
      const [part] = partMeshes([testBody({ tools: [hole, tenon] })], { manifold }, 'z')
      const mesh = closedMesh(part!.geometry)
      expectClosed(mesh)
      const box = boxOf(mesh.vertices)
      expect(box.max.x - box.min.x).toBeCloseTo(830)
    })
  })
})

describe('exportStl', () => {
  it('binär STL med en triangel per 50 byte, i millimeter på bädden', () => {
    const data = exportStl([board, onTop()])
    const view = new DataView(data)
    const count = view.getUint32(80, true)
    expect(count).toBe(24)
    expect(data.byteLength).toBe(84 + 50 * count)
    const zs: number[] = []
    for (let t = 0; t < count; t++)
      for (let k = 0; k < 3; k++) zs.push(view.getFloat32(84 + t * 50 + 12 + k * 12 + 8, true))
    expect(Math.min(...zs)).toBeCloseTo(0)
    expect(Math.max(...zs)).toBeCloseTo(44)
  })

  it('normalerna pekar utåt', () => {
    const view = new DataView(exportStl([board]))
    for (let t = 0; t < 12; t++) {
      const o = 84 + t * 50
      const n = new Vector3(view.getFloat32(o, true), view.getFloat32(o + 4, true), view.getFloat32(o + 8, true))
      const a = new Vector3(view.getFloat32(o + 12, true), view.getFloat32(o + 16, true), view.getFloat32(o + 20, true))
      // Lådans mitt är (0, 0, 11): från mitten till ett hörn går åt samma håll som normalen.
      expect(n.dot(a.sub(new Vector3(0, 0, 11)))).toBeGreaterThan(0)
    }
  })
})

describe('export3mf', () => {
  const read = (data: Uint8Array) => {
    const files = unzipSync(data)
    return { names: Object.keys(files), model: strFromU8(files['3D/3dmodel.model']!), files }
  }

  it('har de filer ett 3MF-paket måste ha, och millimeter', () => {
    const { names, model, files } = read(export3mf([board], {}, 'Bord'))
    expect(names).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model']))
    expect(strFromU8(files['_rels/.rels']!)).toContain('Target="/3D/3dmodel.model"')
    expect(model).toContain('unit="millimeter"')
    expect(model).toContain('<metadata name="Title">Bord</metadata>')
  })

  it('en del per objekt med namn och färg, samlade i ett objekt på bädden', () => {
    const { model } = read(export3mf([board, onTop('Ben & "fot"', 'ek')]))
    expect(model).toContain('name="Skiva" pid="1" pindex="0"')
    expect(model).toContain('name="Ben &amp; &quot;fot&quot;" pid="1" pindex="1"')
    expect(model.match(/<base name=/g)).toHaveLength(2)
    expect(model.match(/<component objectid=/g)).toHaveLength(2)
    expect(model.match(/<item objectid="4"\/>/g)).toHaveLength(1)
    expect(model.match(/<vertex /g)).toHaveLength(16)
    expect(model.match(/<triangle /g)).toHaveLength(24)
  })
})

describe('exportObj', () => {
  it('en grupp per del, i millimeter med y uppåt, och normaler', () => {
    const obj = exportObj([board, onTop('Långt ben')])
    expect(obj.match(/^o /gm)).toEqual(['o ', 'o '])
    expect(obj).toContain('o Långt_ben')
    const ys = [...obj.matchAll(/^v \S+ (\S+) \S+$/gm)].map((m) => Number(m[1]))
    expect(Math.min(...ys)).toBe(0)
    expect(Math.max(...ys)).toBe(44)
    // Den andra delens första hörn är nummer 37 (den första har 36).
    expect(obj).toMatch(/^f 37\/\/37 /m)
    expect(obj.match(/^vn /gm)).toHaveLength(72)
  })
})

describe('exportGlb', () => {
  beforeAll(() => {
    // GLTFExporter läser sina Blob med FileReader, som Node saknar.
    globalThis.FileReader ??= class {
      result: ArrayBuffer | null = null
      onloadend: (() => void) | null = null
      readAsArrayBuffer(blob: Blob) {
        void blob.arrayBuffer().then((r) => {
          this.result = r
          this.onloadend?.()
        })
      }
    } as unknown as typeof FileReader
  })

  it('ger en GLB i meter som går att läsa tillbaka, med delarnas namn', async () => {
    const data = await exportGlb([board, onTop('Ben')])
    expect(new TextDecoder().decode(data.slice(0, 4))).toBe('glTF')
    const gltf = await new GLTFLoader().parseAsync(data, '')
    const names: string[] = []
    gltf.scene.traverse((o) => 'isMesh' in o && names.push(o.name))
    expect(names).toEqual(['Skiva', 'Ben'])
    const box = new Box3().setFromObject(gltf.scene)
    expect(box.min.y).toBeCloseTo(0)
    expect(box.max.y).toBeCloseTo(0.044)
  })
})
