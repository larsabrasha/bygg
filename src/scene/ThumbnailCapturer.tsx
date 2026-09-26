import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import {
  Box3,
  DataUtils,
  HalfFloatType,
  PerspectiveCamera,
  Sphere,
  Vector3,
  WebGLRenderTarget,
  type Object3D,
  type WebGLRenderer,
  type Scene,
} from 'three'
import { useViewStore } from '../store/viewStore'
import { setThumbnailCapturer } from '../sync/thumbnails'
import { neutral } from './neutralToneMap'
import { centerCrop, fitDistance, THUMB } from './thumbnailFit'

const FOV = 35
/** Samma vinkel för alla bilder: snett ovanifrån, som startvyn. */
const VIEW_DIR = new Vector3(1, 0.85, 1.25).normalize()

/**
 * Tar bilder av modellen till startvyn. Renderar med en egen kamera som ser
 * hela modellen, utan rutnät och pil (userData.noThumb) och med genomskinlig
 * bakgrund, direkt i 3D-vyns canvas. Bilden kopieras innan webbläsaren hinner
 * visa den, och vyn ritas sedan om som vanligt.
 *
 * I det realistiska utseendet ritas bilden i stället i en egen buffert, som
 * efterbehandlingen gör (se captureRealistic).
 */
export function ThumbnailCapturer() {
  const { gl, scene, camera, invalidate } = useThree()

  useEffect(() => {
    const capture = (): string | null => {
      const canvas = gl.domElement
      const { width, height } = canvas
      if (!width || !height) return null

      scene.updateMatrixWorld()
      const box = new Box3()
      scene.traverse((o) => {
        const kind = (o.userData.pick as { kind?: string } | undefined)?.kind
        if (kind === 'body' || kind === 'sketch') box.expandByObject(o)
      })
      if (box.isEmpty()) return null
      const sphere = box.getBoundingSphere(new Sphere())
      if (useViewStore.getState().look === 'realistic') return captureRealistic(gl, scene, sphere)

      const crop = centerCrop(width, height)
      const dist = fitDistance(Math.max(sphere.radius, 50), FOV, width, height, crop)
      const cam = new PerspectiveCamera(
        FOV,
        width / height,
        Math.max(1, dist - sphere.radius * 2),
        dist + sphere.radius * 2,
      )
      cam.position.copy(sphere.center).addScaledVector(VIEW_DIR, dist)
      cam.lookAt(sphere.center)
      cam.updateProjectionMatrix()

      const hidden = hideForThumb(scene)
      const background = scene.background
      const clearAlpha = gl.getClearAlpha()
      scene.background = null
      gl.setClearAlpha(0)
      try {
        gl.render(scene, cam)
        const out = document.createElement('canvas')
        out.width = THUMB.width
        out.height = THUMB.height
        out.getContext('2d')?.drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, THUMB.width, THUMB.height)
        return out.toDataURL('image/png')
      } finally {
        for (const o of hidden) o.visible = true
        scene.background = background
        gl.setClearAlpha(clearAlpha)
        gl.render(scene, camera)
        invalidate()
      }
    }
    setThumbnailCapturer(capture)
    return () => setThumbnailCapturer(null)
  }, [gl, scene, camera, invalidate])

  return null
}

/** Döljer det som inte ska med på bilden (rutnät, pilar); returnerar det, så att det kan visas igen. */
function hideForThumb(scene: Scene): Object3D[] {
  const hidden: Object3D[] = []
  scene.traverse((o) => {
    if (o.userData.noThumb && o.visible) {
      o.visible = false
      hidden.push(o)
    }
  })
  return hidden
}

/**
 * Bilden i det realistiska utseendet. Efterbehandlingen ritar scenen i en
 * buffert, utan tonmappning (den gör den själv sist). Ritades bilden direkt i
 * canvasen, med tonmappning, behövde three.js en egen uppsättning shaders för
 * den: att kompilera dem tog en halv sekund på en dator och flera på en
 * telefon, och det blev om igen när delarna fått nya material. Här ritas den
 * som efterbehandlingen ritar, i en buffert med flyttal, med samma shaders,
 * och tonmappas sedan här (samma exponering och Neutral). Canvasen rörs inte,
 * så vyn behöver inte ritas om efteråt.
 */
function captureRealistic(gl: WebGLRenderer, scene: Scene, sphere: Sphere): string | null {
  // Bufferten har kantutjämning (samples), så bilden ritas direkt i sin storlek.
  const { width: w, height: h } = THUMB
  const full = { x: 0, y: 0, w, h }
  const dist = fitDistance(Math.max(sphere.radius, 50), FOV, w, h, full)
  const cam = new PerspectiveCamera(FOV, w / h, Math.max(1, dist - sphere.radius * 2), dist + sphere.radius * 2)
  cam.position.copy(sphere.center).addScaledVector(VIEW_DIR, dist)
  cam.lookAt(sphere.center)
  cam.updateProjectionMatrix()

  const target = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: 4 })
  const hidden = hideForThumb(scene)
  const background = scene.background
  const clearAlpha = gl.getClearAlpha()
  const before = gl.getRenderTarget()
  const pixels = new Uint16Array(w * h * 4)
  try {
    scene.background = null
    gl.setClearAlpha(0)
    gl.setRenderTarget(target)
    gl.clear()
    gl.render(scene, cam)
    gl.readRenderTargetPixels(target, 0, 0, w, h, pixels)
  } finally {
    for (const o of hidden) o.visible = true
    scene.background = background
    gl.setClearAlpha(clearAlpha)
    gl.setRenderTarget(before)
    target.dispose()
  }

  // Linjära flyttal, nedifrån och upp: exponering, Neutral, sRGB, och raderna vända.
  // Kanterna mot den genomskinliga bakgrunden är förmultiplicerade med täckningen
  // (kantutjämningen blandar med svart); färgen delas med den, annars blir kanten mörk.
  const exposure = gl.toneMappingExposure
  const img = new ImageData(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((h - 1 - y) * w + x) * 4
      const o = (y * w + x) * 4
      const a = Math.min(1, Math.max(0, DataUtils.fromHalfFloat(pixels[i + 3]!)))
      if (a === 0) continue
      const rgb = neutral([0, 1, 2].map((k) => (DataUtils.fromHalfFloat(pixels[i + k]!) / a) * exposure))
      for (let k = 0; k < 3; k++) img.data[o + k] = Math.round(toSRGB(rgb[k]!) * 255)
      img.data[o + 3] = Math.round(a * 255)
    }
  }
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  out.getContext('2d')?.putImageData(img, 0, 0)
  return out.toDataURL('image/png')
}

/** Linjärt till sRGB, 0–1. */
function toSRGB(v: number): number {
  const c = Math.min(1, Math.max(0, v))
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
}
