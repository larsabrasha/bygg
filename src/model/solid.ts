import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import type { Box } from './box'
import type { Frame, ToolShape } from './types'

/**
 * En form med sina verktyg som en sluten yta, räknad med manifold-3d: allt
 * som läggs till först, sedan skärs allt ut. I formens egna koordinater.
 * Ingen three.js här, så det går att testa i node.
 */

/** Segment runt en cylinder, som i 3D-vyn (scene/cylinder). */
export const SEGMENTS = 64
/**
 * Färre segment medan man drar: det mesta av tiden går åt till att skära ut runda
 * hål, och den växer med antalet segment. När man släpper räknas formen om med SEGMENTS.
 */
export const DRAG_SEGMENTS = 24
/** Kanter skarpare än så här får egna normaler (platta ytor); flackare blir runda. */
const SHARP_DEGREES = 50

export interface SolidMesh {
  /** x, y, z per hörn. */
  positions: Float32Array
  /** Normal per hörn. */
  normals: Float32Array
  /** Tre hörn per triangel. */
  indices: Uint32Array
}

/** Lådan eller cylindern i sina egna koordinater. */
function primitive(api: ManifoldToplevel, box: Box, segments: number): Manifold {
  const { x0, y0, x1, y1 } = box.profile
  const depth = box.z1 - box.z0
  if (box.shape === 'circle') {
    const r = (x1 - x0) / 2
    return api.Manifold.cylinder(depth, r, r, segments, false).translate([(x0 + x1) / 2, (y0 + y1) / 2, box.z0])
  }
  return api.Manifold.cube([x1 - x0, y1 - y0, depth], false).translate([x0, y0, box.z0])
}

/** Matrisen (kolumnvis, 4×4) som tar verktygets koordinater till formens. */
const matrix = (f: Frame) => [...f.u, 0, ...f.v, 0, ...f.n, 0, ...f.origin, 1] as Parameters<Manifold['transform']>[0]

/**
 * Verktygen ihopslagna, sparade mellan anropen: under ett drag ändras formen
 * men inte verktygen, så de behöver inte byggas om varje gång. Ägs av cachen
 * (tas bort när den trängs ut), inte av buildSolid.
 */
const toolCache = new Map<string, Manifold>()
const TOOL_CACHE_SIZE = 16

function toolUnion(api: ManifoldToplevel, tools: readonly ToolShape[], segments: number): Manifold | null {
  if (tools.length === 0) return null
  const key = JSON.stringify([segments, tools])
  const hit = toolCache.get(key)
  if (hit) {
    toolCache.delete(key)
    toolCache.set(key, hit)
    return hit
  }
  const parts = tools.map((t) => {
    const p = primitive(api, t, segments)
    const placed = p.transform(matrix(t.frame))
    p.delete()
    return placed
  })
  const union = api.Manifold.union(parts)
  // manifold räknar lat: utan detta byggs ihopslagningen om varje gång den används.
  union.numTri()
  for (const p of parts) p.delete()
  toolCache.set(key, union)
  while (toolCache.size > TOOL_CACHE_SIZE) {
    const [oldKey, old] = toolCache.entries().next().value!
    toolCache.delete(oldKey)
    old.delete()
  }
  return union
}

export function buildSolid(
  api: ManifoldToplevel,
  box: Box,
  tools: readonly ToolShape[],
  segments = SEGMENTS,
): SolidMesh {
  // Allt som skapas här lever i wasm-minnet och måste tas bort för hand (utom verktygen, se toolUnion).
  const made: Manifold[] = []
  const keep = (m: Manifold) => (made.push(m), m)
  try {
    const host = keep(primitive(api, box, segments))
    const adds = toolUnion(
      api,
      tools.filter((t) => t.op === 'add'),
      segments,
    )
    const cuts = toolUnion(
      api,
      tools.filter((t) => t.op === 'subtract'),
      segments,
    )
    let solid = adds ? keep(host.add(adds)) : host
    if (cuts) solid = keep(solid.subtract(cuts))
    const mesh = keep(solid.calculateNormals(0, SHARP_DEGREES)).getMesh()
    const n = mesh.numProp
    const count = mesh.vertProperties.length / n
    const positions = new Float32Array(count * 3)
    const normals = new Float32Array(count * 3)
    for (let i = 0; i < count; i++)
      for (let k = 0; k < 3; k++) {
        positions[i * 3 + k] = mesh.vertProperties[i * n + k]!
        normals[i * 3 + k] = mesh.vertProperties[i * n + 3 + k]!
      }
    return { positions, normals, indices: new Uint32Array(mesh.triVerts) }
  } finally {
    for (const m of made) m.delete()
  }
}
