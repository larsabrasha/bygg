import type { ManifoldToplevel } from 'manifold-3d'
import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Scene,
  Vector3,
  type Texture,
} from 'three'
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js'
import { bodyExtents } from '../model/geometry'
import type { Body } from '../model/types'
import { materialColor } from './colors'
import { loadManifold, solidGeometry } from './csg'
import { cylinderGeometry } from './cylinder'
import { DARKER } from './endGrain'
import { frameQuaternion } from './frameTransform'
import { grainUvs, hash01 } from './grainUv'
import { loadWood, woodTone, type Wood } from './woodTexture'

/** Appen ritar i millimeter, USDZ-filen är i meter. */
const MM_TO_M = 0.001

const AXIS_INDEX = { u: 0, v: 1, n: 2 } as const

/**
 * Det exporten behöver men som laddas för sig: manifold-3d för delar med
 * verktyg, och trätexturerna per material. Saknas något blir delen utan
 * verktyg, eller enfärgad.
 */
export interface ArAssets {
  manifold?: ManifoldToplevel | null
  woods?: ReadonlyMap<string, Wood>
}

export async function loadArAssets(bodies: readonly Body[]): Promise<ArAssets> {
  const materials = [...new Set(bodies.map((b) => b.material))]
  const [manifold, woods] = await Promise.all([
    bodies.some((b) => b.tools) ? loadManifold() : null,
    Promise.all(materials.map(async (m) => [m, await loadWood(m)] as const)),
  ])
  return { manifold, woods: new Map(woods) }
}

/**
 * Sorterar trianglarna i två grupper: sidorna (material 0) och ändarna där
 * fibern går rakt ut (material 1), med samma gräns som ändträet i 3D-vyn.
 * Geometrin måste ha index.
 */
export function groupEndGrain(geometry: BufferGeometry, grain: 0 | 1 | 2): void {
  const index = geometry.getIndex()!
  const normal = geometry.getAttribute('normal')
  const sides: number[] = []
  const ends: number[] = []
  for (let t = 0; t < index.count; t += 3) {
    const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)]
    const n = tri.reduce((s, i) => s + Math.abs(normal.getComponent(i, grain)), 0) / 3
    ;(n > 0.7 ? ends : sides).push(...tri)
  }
  geometry.setIndex([...sides, ...ends])
  geometry.clearGroups()
  geometry.addGroup(0, sides.length, 0)
  geometry.addGroup(sides.length, ends.length, 1)
}

/**
 * En kopia av texturen för USDZ-filen: upprepningen ligger i UV-koordinaterna
 * i stället (Quick Look tolkar skalan i texturen fel, se USDZExporter), och
 * bilden sparas som JPEG, inte PNG, så att filen blir mindre. Kopiorna delar
 * bild, så varje foto finns en gång i filen.
 */
function arTexture(texture: Texture): Texture {
  const copy = texture.clone()
  copy.repeat.set(1, 1)
  copy.offset.set(0, 0)
  copy.userData = { ...copy.userData, mimeType: 'image/jpeg' }
  return copy
}

/**
 * Bara delarna (inget rutnät, inga skisser, inga verktyg), i meter om inget annat sägs
 * (unitsPerMm). Mitt på golvytan i origo och undersidan på y = 0, så att AR-visaren
 * ställer möbeln på golvet. En mesh per del, med delens namn, direkt under modellen.
 * Med trätexturer som i det realistiska utseendet: ådring längs fibern, en egen
 * ton per del och mörkare ändträ. Årsringarna på ändarna, plywoodens skikt och de
 * rundade kanterna görs i 3D-vyns shader och kommer inte med.
 */
export function buildArScene(bodies: readonly Body[], { manifold, woods }: ArAssets = {}, unitsPerMm = MM_TO_M): Scene {
  const model = new Group()
  const flat = new Map<string, MeshStandardMaterial>()
  const textures = new Map<string, { map: Texture; normalMap: Texture; repeat: number }>()

  // Verktygen syns i delarna de sitter på; själva verktyget är ett spöke i 3D-vyn.
  for (const b of bodies.filter((x) => !x.tool)) {
    const [w, h, d] = bodyExtents(b)
    const { x0, x1, y0, y1 } = b.profile
    // Med verktyg: resultatet i formens koordinater. Cachen äger den, så den kopieras innan den ändras.
    const solid = manifold && b.tools ? solidGeometry(manifold, b, b.tools).clone() : null
    const geometry = solid ?? (b.shape === 'circle' ? cylinderGeometry(w, d) : new BoxGeometry(w, h, d))

    const wood = woods?.get(b.material)
    let material: MeshStandardMaterial | MeshStandardMaterial[]
    if (wood) {
      let t = textures.get(b.material)
      if (!t) {
        t = { map: arTexture(wood.map), normalMap: arTexture(wood.normalMap), repeat: wood.map.repeat.x }
        textures.set(b.material, t)
      }
      const grain = AXIS_INDEX[b.grainAxis]
      const pos = geometry.getAttribute('position')
      const normal = geometry.getAttribute('normal')
      const uv = grainUvs(pos.array, normal.array, grain, [hash01(b.id), hash01(b.id, 1)])
      for (let i = 0; i < uv.length; i++) uv[i]! *= t.repeat
      geometry.setAttribute('uv', new BufferAttribute(uv, 2))
      groupEndGrain(geometry, grain)
      const tone = woodTone(b.id)
      material = [tone, tone.clone().multiplyScalar(DARKER)].map(
        (color, i) =>
          new MeshPhysicalMaterial({
            name: i ? `${b.material} ändträ` : b.material,
            color,
            map: t.map,
            normalMap: t.normalMap,
            roughness: 0.62,
            metalness: 0,
            clearcoat: 0.3,
            clearcoatRoughness: 0.35,
          }),
      )
    } else {
      let m = flat.get(b.material)
      if (!m) {
        m = new MeshStandardMaterial({ name: b.material, color: materialColor(b.material), roughness: 0.8 })
        flat.set(b.material, m)
      }
      material = m
    }

    const mesh = new Mesh(geometry, material)
    mesh.name = b.name
    mesh.userData.material = b.material
    // Lådan och cylindern har mitten i origo, resultatet från manifold-3d delens origo.
    const q = frameQuaternion(b.frame)
    const center = solid ? new Vector3() : new Vector3((x0 + x1) / 2, (y0 + y1) / 2, (b.z0 + b.z1) / 2)
    mesh.position.copy(center.applyQuaternion(q)).add(new Vector3(...b.frame.origin))
    mesh.quaternion.copy(q)
    model.add(mesh)
  }

  model.scale.setScalar(unitsPerMm)
  const box = new Box3().setFromObject(model)
  if (!box.isEmpty()) {
    const center = box.getCenter(new Vector3())
    model.position.set(-center.x, -box.min.y, -center.z)
  }
  // USDZExporter läser object.matrix utan att räkna om den. Box3 ovan räknade den
  // före flytten; utan detta kom modellen med där den står i appen, inte i mitten.
  model.updateMatrix()

  const scene = new Scene()
  scene.add(model)
  return scene
}

export function exportUsdz(bodies: readonly Body[], assets: ArAssets = {}): Promise<Uint8Array<ArrayBuffer>> {
  return new USDZExporter().parseAsync(buildArScene(bodies, assets), { quickLookCompatible: true })
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
  const data = await exportUsdz(bodies, await loadArAssets(bodies))
  // Quick Look läser filen efter att länken klickats; släpp den förra först nu.
  if (lastUrl) URL.revokeObjectURL(lastUrl)
  lastUrl = URL.createObjectURL(new Blob([data], { type: 'model/vnd.usdz+zip' }))
  const a = document.createElement('a')
  a.rel = 'ar'
  a.href = `${lastUrl}#allowsContentScaling=0`
  a.appendChild(document.createElement('img'))
  a.click()
}
