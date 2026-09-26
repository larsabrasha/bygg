/**
 * Hämtar trätexturerna från Poly Haven och sparar dem färdiga i src/assets/wood
 * (se src/scene/woodSources.ts). Körs med `npm run textures` när ett träslag
 * eller en färg ändras; bilderna checkas in.
 */
import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'
import { materialColor } from '../src/scene/colors.ts'
import { WOOD_SOURCES, woodFile, type WoodSource } from '../src/scene/woodSources.ts'

const OUT = new URL('../src/assets/wood/', import.meta.url)
const SIZE = 1024
/** Buktningar större än så här (i pixlar, ca 1 mm) räknas inte som porer. */
const BLUR = 8

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
  const smooth = blurred(h)
  const detail = h.map((v, i) => v - smooth[i]!)
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

/** Lådsuddning med radien BLUR, i båda led, runt kanten. */
function blurred(h: Float32Array): Float32Array {
  const pass = (src: Float32Array, step: (i: number, k: number) => number) => {
    const out = new Float32Array(src.length)
    for (let i = 0; i < src.length; i++) {
      let s = 0
      for (let k = -BLUR; k <= BLUR; k++) s += src[step(i, k)]!
      out[i] = s / (2 * BLUR + 1)
    }
    return out
  }
  const across = pass(h, (i, k) => Math.floor(i / SIZE) * SIZE + (((i % SIZE) + k + SIZE) % SIZE))
  return pass(across, (i, k) => (i + k * SIZE + SIZE * SIZE) % (SIZE * SIZE))
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
  // Färgen: mönstret kring medianen. Medianen får materialets färg, ljusare och
  // mörkare partier blir ljusare och mörkare efter contrast.
  const grey = await sized(await fetchOnce(src.id, 'Diffuse'), src)
    .greyscale()
    .raw()
    .toBuffer()
  const sorted = Uint8Array.from(grey).sort()
  const median = sorted[sorted.length >> 1]!
  const hex = materialColor(material)
  const color = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const out = Buffer.alloc(SIZE * SIZE * 3)
  for (let i = 0; i < SIZE * SIZE; i++) {
    const g = Math.min(1.25, Math.max(0.3, 1 + ((grey[i]! - median) / median) * src.contrast))
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.min(255, Math.round(color[c]! * g))
  }
  await save(out, new URL(woodFile(material), OUT), 82)

  const normal = await normalsFrom(await fetchOnce(src.id, 'Displacement'), src)
  await save(normal, new URL(woodFile(material, 'normal'), OUT), 80)
  console.log(material, '←', src.id)
}
