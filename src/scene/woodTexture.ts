import { CanvasTexture, Color, RepeatWrapping, SRGBColorSpace } from 'three'
import { materialColor } from './colors'

/**
 * Hur ådringen ser ut per träslag: antal årsringar över bildens höjd
 * (ACROSS_MM i grainUv), hur mörk senveden är och hur mycket ringarna slingrar.
 */
const GRAIN: Record<string, { rings: number; contrast: number; wave: number }> = {
  furu: { rings: 7, contrast: 0.32, wave: 0.9 },
  gran: { rings: 8, contrast: 0.22, wave: 0.7 },
  ek: { rings: 11, contrast: 0.3, wave: 0.5 },
  björk: { rings: 13, contrast: 0.18, wave: 0.4 },
  ask: { rings: 9, contrast: 0.24, wave: 0.5 },
  plywood: { rings: 5, contrast: 0.14, wave: 1.2 },
}
const DEFAULT = { rings: 8, contrast: 0.22, wave: 0.7 }

/** Bredd längs fibern och höjd tvärs, i pixlar. Förhållandet följer GRAIN_MM / ACROSS_MM (600 / 150). */
const W = 1024
const H = 256

const cache = new Map<string, CanvasTexture>()

/**
 * Trätextur för ett material, ritad i en canvas: årsringar längs bildens
 * bredd som slingrar lite, mörkare senved och fina porer. Alla vågor har hela
 * perioder över bilden, så att den går att upprepa utan skarvar. En per
 * material; delas av alla delar av det.
 */
export function woodTexture(material: string): CanvasTexture {
  const hit = cache.get(material)
  if (hit) return hit

  const { rings, contrast, wave } = GRAIN[material] ?? DEFAULT
  // Canvasen är i sRGB; Color har linjära värden, så de hämtas i sRGB.
  const base = { r: 0, g: 0, b: 0 }
  new Color(materialColor(material)).getRGB(base, SRGBColorSpace)
  const late = { r: base.r * (1 - contrast), g: base.g * (1 - contrast), b: base.b * (1 - contrast) }
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(W, H)
  const TAU = Math.PI * 2

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W
      const v = y / H
      // Ringarnas läge tvärs fibern, med långa slingor och en kortare krusning längs den.
      const t =
        v * rings +
        wave * 0.35 * Math.sin(TAU * (u * 2 + v)) +
        wave * 0.12 * Math.sin(TAU * (u * 7 + v * 3)) +
        0.05 * Math.sin(TAU * (u * 23 + v * 11))
      const ring = t - Math.floor(t)
      // Senveden: ett smalt mörkt band mot slutet av varje ring.
      const lateWood = smooth(ring, 0.7, 0.95)
      // Porer och fina streck längs fibern.
      const pores = 0.5 + 0.5 * Math.sin(TAU * (v * 97 + 0.3 * Math.sin(TAU * u * 3)))
      const shade = lateWood * 0.85 + pores * 0.12
      const i = (y * W + x) * 4
      img.data[i] = 255 * (base.r + (late.r - base.r) * shade)
      img.data[i + 1] = 255 * (base.g + (late.g - base.g) * shade)
      img.data[i + 2] = 255 * (base.b + (late.b - base.b) * shade)
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  cache.set(material, texture)
  return texture
}

/** 0 före a, 1 efter b, mjukt emellan; och tillbaka till 0 vid ringens slut. */
function smooth(x: number, a: number, b: number): number {
  const up = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return up * up * (3 - 2 * up) * (1 - Math.max(0, (x - b) / (1 - b)))
}
