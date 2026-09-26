import { BufferGeometry, Color, Matrix4, Mesh, Vector3 } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { strToU8, zipSync } from 'three/examples/jsm/libs/fflate.module.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Body } from '../model/types'
import { buildArScene, type ArAssets } from './arExport'
import { materialColor } from './colors'

/**
 * Filer för andra program. GLB är i meter med y uppåt (glTF:s regel, Blender vrider
 * själv till z uppåt). OBJ, STL och 3MF är i millimeter: det CAD-program och
 * 3D-skrivare räknar med. OBJ har y uppåt som brukligt, STL och 3MF z uppåt som
 * skrivarens bädd. Alla står mitt på golvet (bädden) med undersidan på noll.
 */

/** GLB (binär glTF) med trätexturerna. För Blender och det mesta annat. Behöver en webbläsare (bilderna ritas om). */
export async function exportGlb(bodies: readonly Body[], assets: ArAssets = {}): Promise<ArrayBuffer> {
  const result = await new GLTFExporter().parseAsync(buildArScene(bodies, assets), { binary: true })
  return result as ArrayBuffer
}

/** En del som trianglar i världens koordinater, i millimeter. */
export interface PartMesh {
  name: string
  material: string
  geometry: BufferGeometry
}

/** y uppåt → z uppåt: vrid 90° runt x, så att framsidan (+z i appen) blir −y. */
const Y_TO_Z_UP = new Matrix4().makeRotationX(Math.PI / 2)

/** Varje del som en egen geometri i millimeter, bara läge och normaler, utan index. */
export function partMeshes(bodies: readonly Body[], assets: ArAssets, up: 'y' | 'z'): PartMesh[] {
  const scene = buildArScene(bodies, { manifold: assets.manifold }, 1)
  if (up === 'z') scene.applyMatrix4(Y_TO_Z_UP)
  scene.updateMatrixWorld(true)
  const parts: PartMesh[] = []
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const src = o.geometry as BufferGeometry
    const g = new BufferGeometry()
    g.setAttribute('position', src.getAttribute('position').clone())
    g.setAttribute('normal', src.getAttribute('normal').clone())
    if (src.index) g.setIndex(src.index.clone())
    const flat = g.index ? g.toNonIndexed() : g
    flat.applyMatrix4(o.matrixWorld)
    parts.push({ name: o.name, material: String(o.userData.material), geometry: flat })
  })
  return parts
}

const num = (x: number) => String(Math.round(x * 1e4) / 1e4)

/** OBJ i millimeter med y uppåt, en grupp per del. Utan material (ingen MTL-fil). */
export function exportObj(bodies: readonly Body[], assets: ArAssets = {}): string {
  const lines = ['# Exporterad från Bygg. Enhet: millimeter, y uppåt.']
  let base = 1
  for (const p of partMeshes(bodies, assets, 'y')) {
    const pos = p.geometry.getAttribute('position')
    const nor = p.geometry.getAttribute('normal')
    lines.push(`o ${objName(p.name)}`)
    for (let i = 0; i < pos.count; i++) lines.push(`v ${num(pos.getX(i))} ${num(pos.getY(i))} ${num(pos.getZ(i))}`)
    for (let i = 0; i < nor.count; i++) lines.push(`vn ${num(nor.getX(i))} ${num(nor.getY(i))} ${num(nor.getZ(i))}`)
    for (let i = 0; i < pos.count; i += 3) {
      const [a, b, c] = [base + i, base + i + 1, base + i + 2]
      lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`)
    }
    base += pos.count
  }
  return lines.join('\n') + '\n'
}

/** Namn på en rad i OBJ: blanksteg skiljer fält åt. */
const objName = (name: string) => name.trim().replace(/\s+/g, '_') || 'Del'

/** Binär STL i millimeter med z uppåt: alla delar i en kropp, som skrivarprogrammen läser den. */
export function exportStl(bodies: readonly Body[], assets: ArAssets = {}): ArrayBuffer {
  const parts = partMeshes(bodies, assets, 'z')
  const count = parts.reduce((s, p) => s + p.geometry.getAttribute('position').count / 3, 0)
  const buffer = new ArrayBuffer(84 + 50 * count)
  const view = new DataView(buffer)
  new Uint8Array(buffer).set(strToU8('Bygg, millimeter'.padEnd(80, ' ')).subarray(0, 80))
  view.setUint32(80, count, true)
  let at = 84
  const [a, b, c, n] = [new Vector3(), new Vector3(), new Vector3(), new Vector3()]
  for (const p of parts) {
    const pos = p.geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i)
      b.fromBufferAttribute(pos, i + 1)
      c.fromBufferAttribute(pos, i + 2)
      n.subVectors(c, b).cross(new Vector3().subVectors(a, b)).normalize()
      for (const v of [n, a, b, c]) {
        view.setFloat32(at, v.x, true)
        view.setFloat32(at + 4, v.y, true)
        view.setFloat32(at + 8, v.z, true)
        at += 12
      }
      at += 2 // attributbyten, alltid 0
    }
  }
  return buffer
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const hex = (c: Color) => `#${c.getHexString().toUpperCase()}`

/**
 * 3MF i millimeter med z uppåt: varje del en sluten mesh med sitt namn och
 * materialets färg, samlade i ett objekt så att modellen hålls ihop på bädden.
 * Delarna går att dela upp i skrivarprogrammet.
 */
export function export3mf(bodies: readonly Body[], assets: ArAssets = {}, title = 'Modell'): Uint8Array<ArrayBuffer> {
  const parts = partMeshes(bodies, assets, 'z')
  const materials = [...new Set(parts.map((p) => p.material))]
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="sv-SE" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `<metadata name="Title">${xml(title)}</metadata>`,
    '<metadata name="Application">Bygg</metadata>',
    '<resources>',
    '<basematerials id="1">',
    ...materials.map((m) => `<base name="${xml(m)}" displaycolor="${hex(new Color(materialColor(m)))}"/>`),
    '</basematerials>',
  ]
  parts.forEach((p, i) => {
    const { vertices, triangles } = closedMesh(p.geometry)
    out.push(
      `<object id="${i + 2}" type="model" name="${xml(p.name)}" pid="1" pindex="${materials.indexOf(p.material)}"><mesh><vertices>`,
    )
    for (let v = 0; v < vertices.length; v += 3)
      out.push(`<vertex x="${num(vertices[v]!)}" y="${num(vertices[v + 1]!)}" z="${num(vertices[v + 2]!)}"/>`)
    out.push('</vertices><triangles>')
    for (let t = 0; t < triangles.length; t += 3)
      out.push(`<triangle v1="${triangles[t]}" v2="${triangles[t + 1]}" v3="${triangles[t + 2]}"/>`)
    out.push('</triangles></mesh></object>')
  })
  const assembly = parts.length + 2
  out.push(
    `<object id="${assembly}" type="model" name="${xml(title)}"><components>`,
    ...parts.map((_, i) => `<component objectid="${i + 2}"/>`),
    '</components></object>',
    '</resources>',
    `<build><item objectid="${assembly}"/></build>`,
    '</model>',
  )
  // fflate skapar alltid en ny ArrayBuffer.
  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>' +
        '</Relationships>',
    ),
    '3D/3dmodel.model': strToU8(out.join('\n')),
  }) as Uint8Array<ArrayBuffer>
}

/**
 * Hörnen delade mellan trianglarna, så att meshen blir sluten (3MF kräver det):
 * lådans och cylinderns sidor har egna hörn för normalernas skull.
 * Trianglar som blivit till en linje eller en punkt tas bort.
 */
export function closedMesh(geometry: BufferGeometry): { vertices: Float32Array; triangles: Uint32Array } {
  const g = new BufferGeometry()
  g.setAttribute('position', geometry.getAttribute('position'))
  const merged = mergeVertices(g, 1e-3)
  const index = merged.getIndex()!
  const triangles: number[] = []
  for (let t = 0; t < index.count; t += 3) {
    const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)]
    if (a !== b && b !== c && a !== c) triangles.push(a, b, c)
  }
  return {
    vertices: new Float32Array(merged.getAttribute('position').array),
    triangles: new Uint32Array(triangles),
  }
}
