import { createPortal, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  Box3,
  DataUtils,
  HalfFloatType,
  PerspectiveCamera,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three'
import { resolveBodies } from '../model/resolve'
import { useDocumentStore } from '../store/documentStore'
import { setThumbnailCapturer } from '../sync/thumbnails'
import { aces } from './acesToneMap'
import { BodyMesh } from './BodyMesh'
import { ShadedLights } from './ShadedLights'
import { SketchMesh } from './SketchMesh'
import { fitDistance, THUMB } from './thumbnailFit'

const FOV = 35
/** Samma vinkel för alla bilder: snett ovanifrån, som startvyn. */
const VIEW_DIR = new Vector3(1, 0.85, 1.25).normalize()

/**
 * Tar bilder av modellen till startvyn. Bilden är alltid skuggad, vilket
 * utseende man än valt i 3D-vyn. Därför har den en egen scen, som ligger i
 * samma canvas men aldrig visas: delarna och skisserna som dokumentet har dem,
 * skuggade, utan det valda, spöken, rutnät och pilar. Hopsatt också när vyn
 * visar sprängskissen. Så ser alla bilder på startsidan likadana ut.
 * Delarnas former med hål och tappar räknas inte om: de delas med 3D-vyn (se csg).
 */
export function ThumbnailCapturer() {
  const gl = useThree((s) => s.gl)
  const scene = useMemo(() => new Scene(), [])
  const doc = useDocumentStore((s) => s.doc)
  const bodies = useMemo(() => resolveBodies(doc).filter((b) => !b.tool), [doc])

  useEffect(() => {
    setThumbnailCapturer(() => capture(gl, scene))
    return () => setThumbnailCapturer(null)
  }, [gl, scene])

  return createPortal(
    <>
      <ShadedLights />
      {bodies.map((b) => (
        <BodyMesh key={b.id} body={b} />
      ))}
      {doc.sketches.map((s) => (
        <SketchMesh key={s.id} frame={s.frame} rect={s.rect} shape={s.shape} pickId={s.id} />
      ))}
    </>,
    scene,
  )
}

/**
 * Bilden som data-URL, eller null om modellen är tom. Den ritas i en egen
 * buffert med flyttal och kantutjämning, direkt i sin storlek, så att 3D-vyns
 * canvas inte rörs (i det realistiska utseendet ritar efterbehandlingen den,
 * och den skulle annars behöva ritas om). I en buffert tonmappar three.js
 * inte; det görs här i stället, som i det skuggade utseendet (ACES, sRGB).
 */
function capture(gl: WebGLRenderer, scene: Scene): string | null {
  scene.updateMatrixWorld()
  const box = new Box3()
  scene.traverse((o) => {
    const kind = (o.userData.pick as { kind?: string } | undefined)?.kind
    if (kind === 'body' || kind === 'sketch') box.expandByObject(o)
  })
  if (box.isEmpty()) return null
  const sphere = box.getBoundingSphere(new Sphere())

  const { width: w, height: h } = THUMB
  const full = { x: 0, y: 0, w, h }
  const dist = fitDistance(Math.max(sphere.radius, 50), FOV, w, h, full)
  const cam = new PerspectiveCamera(FOV, w / h, Math.max(1, dist - sphere.radius * 2), dist + sphere.radius * 2)
  cam.position.copy(sphere.center).addScaledVector(VIEW_DIR, dist)
  cam.lookAt(sphere.center)
  cam.updateProjectionMatrix()

  const target = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: 4 })
  const clearAlpha = gl.getClearAlpha()
  const before = gl.getRenderTarget()
  const pixels = new Uint16Array(w * h * 4)
  try {
    gl.setClearAlpha(0)
    gl.setRenderTarget(target)
    gl.clear()
    gl.render(scene, cam)
    gl.readRenderTargetPixels(target, 0, 0, w, h, pixels)
  } finally {
    gl.setClearAlpha(clearAlpha)
    gl.setRenderTarget(before)
    target.dispose()
  }

  // Linjära flyttal, nedifrån och upp: ACES, sRGB, och raderna vända.
  // Kanterna mot den genomskinliga bakgrunden är förmultiplicerade med täckningen
  // (kantutjämningen blandar med svart); färgen delas med den, annars blir kanten mörk.
  const img = new ImageData(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((h - 1 - y) * w + x) * 4
      const o = (y * w + x) * 4
      const a = Math.min(1, Math.max(0, DataUtils.fromHalfFloat(pixels[i + 3]!)))
      if (a === 0) continue
      const rgb = aces([0, 1, 2].map((k) => DataUtils.fromHalfFloat(pixels[i + k]!) / a))
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
