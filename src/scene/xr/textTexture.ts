import { CanvasTexture, SRGBColorSpace } from 'three'

/** Pixlar per meter i texturerna: skarpt på en halvmeters avstånd. */
const PX_PER_M = 4000

export interface TextStyle {
  /** Storlek i meter (i VR-menyns enhet). */
  width: number
  height: number
  bg: string
  color: string
  /** Textens höjd i meter. */
  size: number
  align?: 'left' | 'center' | 'right'
  bold?: boolean
  /** Rundade hörn, i meter. */
  radius?: number
  /** En ikon mitt i rutan i stället för text; size är dess sida i meter. */
  icon?: { image: CanvasImageSource; size: number } | null
}

/**
 * En bit text på en färgad ruta, ritad på en canvas: knappar och fält i
 * VR-menyn. Systemets typsnitt, så att inget behöver hämtas (fungerar offline).
 * Lång text bryts på ord. Med en ikon ritas den i stället för texten.
 */
export function textTexture(text: string, style: TextStyle): CanvasTexture {
  const w = Math.max(8, Math.round(style.width * PX_PER_M))
  const h = Math.max(8, Math.round(style.height * PX_PER_M))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  const r = (style.radius ?? 0) * PX_PER_M
  g.fillStyle = style.bg
  g.beginPath()
  g.roundRect(0, 0, w, h, r)
  g.fill()

  if (style.icon) {
    const side = style.icon.size * PX_PER_M
    g.drawImage(style.icon.image, (w - side) / 2, (h - side) / 2, side, side)
    return finish(canvas)
  }

  const px = style.size * PX_PER_M
  g.font = `${style.bold ? 600 : 400} ${px}px system-ui, -apple-system, 'Segoe UI', sans-serif`
  g.fillStyle = style.color
  g.textBaseline = 'middle'
  const align = style.align ?? 'center'
  g.textAlign = align
  const pad = px * 0.6
  const x = align === 'left' ? pad : align === 'right' ? w - pad : w / 2
  const lines = wrap(text, (s) => g.measureText(s).width, w - pad * 2)
  const lineH = px * 1.25
  const top = h / 2 - ((lines.length - 1) * lineH) / 2
  lines.forEach((line, i) => g.fillText(line, x, top + i * lineH))
  return finish(canvas)
}

function finish(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/**
 * Bryter text på ord så att varje rad får plats i maxWidth. Ett ord som är för
 * långt får en egen rad. \n ger alltid en ny rad.
 */
export function wrap(text: string, measure: (s: string) => number, maxWidth: number): string[] {
  if (text.includes('\n')) return text.split('\n').flatMap((part) => wrap(part, measure, maxWidth))
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (line && measure(next) > maxWidth) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}
