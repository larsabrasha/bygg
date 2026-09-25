import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene, Vector3 } from 'three'
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js'
import { bodyExtents } from '../model/geometry'
import type { Body } from '../model/types'
import { materialColor } from './colors'
import { cylinderGeometry } from './cylinder'
import { frameQuaternion } from './frameTransform'

/** Appen ritar i millimeter, USDZ-filen är i meter. */
const MM_TO_M = 0.001

/**
 * Bara delarna (inget rutnät, inga skisser), i meter. Mitt på golvytan i origo och
 * undersidan på y = 0, så att AR-visaren ställer möbeln på golvet.
 */
export function buildArScene(bodies: readonly Body[]): Scene {
  const model = new Group()
  const materials = new Map<string, MeshStandardMaterial>()

  for (const b of bodies) {
    let material = materials.get(b.material)
    if (!material) {
      material = new MeshStandardMaterial({ color: materialColor(b.material), roughness: 0.8 })
      materials.set(b.material, material)
    }
    const [w, h, d] = bodyExtents(b)
    const { x0, x1, y0, y1 } = b.profile
    const geometry = b.shape === 'circle' ? cylinderGeometry(w, d) : new BoxGeometry(w, h, d)
    const mesh = new Mesh(geometry, material)
    mesh.name = b.name
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (b.z0 + b.z1) / 2)
    const part = new Group()
    part.position.set(...b.frame.origin)
    part.quaternion.copy(frameQuaternion(b.frame))
    part.add(mesh)
    model.add(part)
  }

  model.scale.setScalar(MM_TO_M)
  const box = new Box3().setFromObject(model)
  if (!box.isEmpty()) {
    const center = box.getCenter(new Vector3())
    model.position.set(-center.x, -box.min.y, -center.z)
  }

  const scene = new Scene()
  scene.add(model)
  return scene
}

export function exportUsdz(bodies: readonly Body[]): Promise<Uint8Array<ArrayBuffer>> {
  return new USDZExporter().parseAsync(buildArScene(bodies), { quickLookCompatible: true })
}

/** AR Quick Look finns på iPhone och iPad (och Vision Pro), inte på Android eller desktop. */
export function arQuickLookSupported(): boolean {
  return typeof document !== 'undefined' && document.createElement('a').relList.supports('ar')
}

let lastUrl: string | null = null

/**
 * Öppnar modellen i AR Quick Look. Länken måste ha rel="ar" och ett img-barn,
 * annars laddar Safari ner filen i stället för att visa den.
 * allowsContentScaling=0: modellen visas i verklig storlek och går inte att nypa större.
 */
export async function openInAr(bodies: readonly Body[]): Promise<void> {
  const data = await exportUsdz(bodies)
  // Quick Look läser filen efter att länken klickats; släpp den förra först nu.
  if (lastUrl) URL.revokeObjectURL(lastUrl)
  lastUrl = URL.createObjectURL(new Blob([data], { type: 'model/vnd.usdz+zip' }))
  const a = document.createElement('a')
  a.rel = 'ar'
  a.href = `${lastUrl}#allowsContentScaling=0`
  a.appendChild(document.createElement('img'))
  a.click()
}
