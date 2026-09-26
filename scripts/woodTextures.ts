/**
 * Hämtar trätexturerna från Poly Haven och sparar dem färdiga i src/assets/wood
 * (se src/scene/woodSources.ts). Körs med `npm run textures` när ett träslag
 * eller en färg ändras; bilderna checkas in.
 */
import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'
import { Color } from 'three'
import { materialColor } from '../src/scene/colors.ts'
import { WOOD_SOURCES, woodFile, type WoodSource } from '../src/scene/woodSources.ts'

const OUT = new URL('../src/assets/wood/', import.meta.url)
const SIZE = 1024
/** Buktningar större än så här (i pixlar, ca 1 mm) räknas inte som porer. */
const BLUR = 8
/**
 * Ljusare och mörkare partier större än så här (i pixlar, några centimeter)
 * kommer från fotot (ljuset, lacken, smuts), inte från träet; de tas bort.
 */
const FLATTEN = 48
/** Så mörkt (i förhållande till medel) som ett parti får vara innan det har senvedens färg helt. */
const DARKEST = 0.45

type Kind = 'Diffuse' | 'Displacement'

async function download(id: string, map: Kind): Promise<Buffer> {
  const res = await fetch(`https://api.polyhaven.com/files/${id}`)
  const files = (await res.json()) as Record<Kind, Record<string, Record<'jpg' | 'png', { url: string }>>>
  // Höjden som png: den har 16 bitar, jpg bara 8, och porerna är små skillnader.
  const url = files[map]['2k']![map === 'Displacement' ? 'png' : 'jpg'].url
  return Buffer.from(await (await fetch(url)).arrayBuffer())
}

/** Bilden i SIZE × SIZE, vriden och speglad som src säger. */
function sized(photo: Buffer, src: WoodSource) {
  let img = sharp(photo).resize(SIZE, SIZE)
  if (src.rotate) img = img.rotate(src.rotate)
  if (src.flip) img = img.flip()
  return img
}

/**
 * Normaler ur höjdkartan: porer och ådring som lutning i ytan. Stora
 * buktningar (fotot av ett fanér är inte helt plant) tas bort genom att dra
 * av en suddad kopia, och lutningen skalas så att den i snitt är src.pores.
 * Bilden upprepas, så grannarna vid kanten hämtas från andra sidan.
 */
async function normalsFrom(height: Buffer, src: WoodSource): Promise<Buffer> {
  const raw = await sized(height, src).extractChannel(0).raw({ depth: 'ushort' }).toBuffer()
  const h = Float32Array.from(new Uint16Array(raw.buffer, raw.byteOffset, SIZE * SIZE))
  // Först en lätt suddning mot bruset i skanningen, sedan bort med buktningarna.
  const clean = blurred(h, 1)
  const smooth = blurred(clean, BLUR)
  const detail = clean.map((v, i) => v - smooth[i]!)
  const at = (x: number, y: number) => detail[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)]!
  const dx = new Float32Array(SIZE * SIZE)
  const dy = new Float32Array(SIZE * SIZE)
  let sum = 0
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x
      dx[i] = (at(x + 1, y) - at(x - 1, y)) / 2
      // Bildens rader går nedåt; normalkartans G pekar uppåt (OpenGL, som three.js).
      dy[i] = (at(x, y - 1) - at(x, y + 1)) / 2
      sum += dx[i]! ** 2 + dy[i]! ** 2
    }
  }
  const scale = src.pores / Math.sqrt(sum / (SIZE * SIZE))
  const out = Buffer.alloc(SIZE * SIZE * 3)
  for (let i = 0; i < SIZE * SIZE; i++) {
    const [x, y] = [-dx[i]! * scale, -dy[i]! * scale]
    const len = Math.hypot(x, y, 1)
    out[i * 3] = Math.round((x / len) * 127.5 + 127.5)
    out[i * 3 + 1] = Math.round((y / len) * 127.5 + 127.5)
    out[i * 3 + 2] = Math.round((1 / len) * 127.5 + 127.5)
  }
  return out
}

/** Lådsuddning med radien r (pixlar), i båda led, runt kanten. Löpande summa: lika snabb för alla r. */
function blurred(h: Float32Array, r: number): Float32Array {
  const pass = (src: Float32Array, step: (i: number, k: number) => number) => {
    const out = new Float32Array(src.length)
    for (let line = 0; line < SIZE; line++) {
      const first = step === across ? line * SIZE : line
      let s = 0
      for (let k = -r; k <= r; k++) s += src[step(first, k)]!
      for (let j = 0; j < SIZE; j++) {
        const i = step(first, j)
        out[i] = s / (2 * r + 1)
        s += src[step(first, j + r + 1)]! - src[step(first, j - r)]!
      }
    }
    return out
  }
  return pass(pass(h, across), down)
}
/** Pixeln k steg till höger om, eller under, pixeln i, runt kanten. */
const across = (i: number, k: number) => Math.floor(i / SIZE) * SIZE + (((i % SIZE) + (k % SIZE) + SIZE) % SIZE)
const down = (i: number, k: number) => (i + (k % SIZE) * SIZE + SIZE * SIZE) % (SIZE * SIZE)

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))

/**
 * Senvedens färg ur grundfärgen: mörkare, mer mättad och lite rödare. Mörka
 * partier i trä är brunare, inte bara en mörkare variant av samma gula
 * (som ser grönaktig ut).
 */
function lateWood([r, g, b]: number[]): number[] {
  const c = new Color(r! / 255, g! / 255, b! / 255)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  c.setHSL((hsl.h - 0.02 + 1) % 1, Math.min(1, hsl.s * 1.25), hsl.l * 0.55)
  return [c.r * 255, c.g * 255, c.b * 255]
}

const save = (data: Buffer, file: URL, quality: number) =>
  sharp(data, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .webp({ quality })
    .toFile(file.pathname)

await mkdir(OUT, { recursive: true })
const cache = new Map<string, Buffer>()
const fetchOnce = async (id: string, map: Kind) => {
  const key = `${id}/${map}`
  const hit = cache.get(key) ?? (await download(id, map))
  cache.set(key, hit)
  return hit
}

for (const [material, src] of Object.entries(WOOD_SOURCES)) {
  // Färgen: mönstret kring det lokala medelvärdet (så att fotots ljus och
  // fläckar försvinner). Medel får grundfärgen, ljusare partier blir ljusare
  // och mörkare glider mot senvedens färg, efter contrast.
  const grey = await sized(await fetchOnce(src.id, 'Diffuse'), src)
    .greyscale()
    .raw()
    .toBuffer()
  const lum = Float32Array.from(grey)
  const mean = blurred(lum, FLATTEN)
  const base = hex(src.color ?? materialColor(material))
  const late = lateWood(base)
  const out = Buffer.alloc(SIZE * SIZE * 3)
  for (let i = 0; i < SIZE * SIZE; i++) {
    const v = 1 + (lum[i]! / Math.max(1, mean[i]!) - 1) * src.contrast
    const t = Math.min(1, Math.max(0, (1 - v) / (1 - DARKEST)))
    const light = Math.min(1.2, Math.max(1, v))
    for (let c = 0; c < 3; c++) {
      out[i * 3 + c] = Math.min(255, Math.round((base[c]! + (late[c]! - base[c]!) * t) * light))
    }
  }
  await save(out, new URL(woodFile(material), OUT), 82)

  const normal = await normalsFrom(await fetchOnce(src.id, 'Displacement'), src)
  await save(normal, new URL(woodFile(material, 'normal'), OUT), 80)
  console.log(material, '←', src.id)
}
