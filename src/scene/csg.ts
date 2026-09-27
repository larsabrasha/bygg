import type { ManifoldToplevel } from 'manifold-3d'
import { useEffect, useSyncExternalStore } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import type { Box } from '../model/box'
import { buildSolid, SEGMENTS, type SolidMesh } from '../model/solid'
import type { ToolShape } from '../model/types'

/**
 * manifold-3d (wasm, runt en halv megabyte) laddas först när en modell har
 * verktyg. Tills dess ritas delarna utan dem.
 */
let api: ManifoldToplevel | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function load(): Promise<void> {
  loading ??= (async () => {
    const [{ default: Module }, { default: wasmUrl }] = await Promise.all([
      import('manifold-3d'),
      import('manifold-3d/manifold.wasm?url'),
    ])
    const m = await Module({ locateFile: () => wasmUrl })
    m.setup()
    api = m
    listeners.forEach((l) => l())
  })().catch((e: unknown) => {
    // Går det inte att ladda (t.ex. offline innan den cachats) ritas delarna utan verktyg.
    console.error('Kunde inte ladda manifold-3d', e)
    loading = null
  })
  return loading
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** manifold-3d, eller null medan den laddas. needed = något i vyn behöver den. */
export function useManifold(needed: boolean): ManifoldToplevel | null {
  const current = useSyncExternalStore(subscribe, () => api)
  useEffect(() => {
    if (needed && !api) void load()
  }, [needed])
  return current
}

/** manifold-3d när den laddats, eller null om den inte gick att ladda. För exporten, som inte ritar. */
export async function loadManifold(): Promise<ManifoldToplevel | null> {
  if (!api) await load()
  return api
}

/**
 * Senast använda former med verktyg, som talföljder, per form och verktyg. Länkade kopior
 * delar samma. Rymmer en stor modell (Matgrupp har runt 90 delar med verktyg), så att den
 * inte räknas om när delarna ritas om. Cachen har ingen three.js-geometri: varje del får
 * en egen (se solidGeometry), så att den kan få egna texturkoordinater.
 */
const cache = new Map<string, SolidMesh>()
const CACHE_SIZE = 256

/**
 * Formen med sina verktyg som three.js-geometri, i formens koordinater.
 * segments = segment runt det som är runt (färre medan man drar, DRAG_SEGMENTS).
 * Geometrin är ny varje gång och ägs av den som anropar (dispose). Talföljderna delas
 * med cachen och andra delar: kopiera geometrin (clone) innan den ändras.
 */
export function solidGeometry(
  m: ManifoldToplevel,
  box: Box,
  tools: readonly ToolShape[],
  segments = SEGMENTS,
): BufferGeometry {
  const key = JSON.stringify([segments, box.profile, box.shape, box.z0, box.z1, tools])
  let mesh = cache.get(key)
  if (mesh) {
    // Senast använd sist, så att den tas bort sist.
    cache.delete(key)
    cache.set(key, mesh)
  } else {
    mesh = buildSolid(m, box, tools, segments)
    cache.set(key, mesh)
    while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(mesh.positions, 3))
  g.setAttribute('normal', new BufferAttribute(mesh.normals, 3))
  g.setIndex(new BufferAttribute(mesh.indices, 1))
  g.computeBoundingSphere()
  return g
}
