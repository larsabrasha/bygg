import { ShaderChunk, type Material, type WebGLProgramParametersWithUniforms } from 'three'
import { hash01, UV_MM } from './grainUv'

/**
 * Ändträ: på sidorna där fibern går rakt ut syns årsringarna som bågar runt
 * märgen, inte ådringen längs fibern. Samma foto används, men omräknat runt
 * märgen per pixel i shadern: avståndet från märgen läses tvärs över fotots
 * ränder (som blir ringarna), och läget längs bågen läses längs fibern. Så får
 * ringarna samma färg och oregelbundenhet som resten av delen. Ändträ suger åt
 * sig mer olja och ser mörkare ut; det blir det här också.
 *
 * Planet tvärs fibern har två axlar, i ordningen (fibern x) y, z · (y) z, x · (z) x, y.
 */
export interface EndGrain {
  /** Märgen i planet tvärs fibern, i geometrins koordinater (mm). */
  pith: [number, number]
  /** Riktningen längs bågarna mitt på änden, enhetsvektor i samma plan. */
  tangent: [number, number]
}

/** Hur mycket tätare ringarna är än ränderna på långsidan (där ringarna skärs snett). */
const RING = 2
/** Så mycket mörkare ändträ är. */
const DARKER = 0.78

const plane = (grain: 0 | 1 | 2) =>
  (
    [
      [1, 2],
      [2, 0],
      [0, 1],
    ] as const
  )[grain]

/**
 * Var märgen sitter för en del: under eller över brädan (en flatsågad bräda
 * är sågad ur stocken en bit från mitten), längs den tunna ledden och en bit
 * i sidled, olika för varje del. En rund del (svarvad) har märgen nära mitten.
 */
export function endGrainFor(
  min: readonly number[],
  max: readonly number[],
  grain: 0 | 1 | 2,
  round: boolean,
  id: string,
): EndGrain {
  const [a, b] = plane(grain)
  const center = [(min[a]! + max[a]!) / 2, (min[b]! + max[b]!) / 2] as const
  const size = [max[a]! - min[a]!, max[b]! - min[b]!] as const
  const r1 = hash01(id, 7)
  const r2 = hash01(id, 8)
  if (round) {
    const off = Math.min(size[0], size[1]) * 0.15
    const angle = r1 * Math.PI * 2
    return {
      pith: [center[0] + Math.cos(angle) * off, center[1] + Math.sin(angle) * off],
      tangent: [-Math.sin(angle), Math.cos(angle)],
    }
  }
  // Den tunna ledden (tjockleken) är där märgen ligger; den breda går längs bågarna.
  const thin = size[0] <= size[1] ? 0 : 1
  const wide = 1 - thin
  const side = r1 < 0.5 ? -1 : 1
  const pith: [number, number] = [0, 0]
  pith[thin] = center[thin]! + side * (size[thin]! / 2 + 40 + r2 * 200)
  pith[wide] = center[wide]! + (r1 * 2 - 1) * 0.3 * size[wide]!
  const tangent: [number, number] = [0, 0]
  tangent[wide] = 1
  return { pith, tangent }
}

/**
 * Lägger till ändträet i ett trämaterial. repeat: texturens upprepning per
 * UV_MM (samma som texture.repeat). Alla delar delar samma program
 * (customProgramCacheKey); märgen skiljer bara i uniforms.
 */
export function withEndGrain(material: Material, grain: 0 | 1 | 2, end: EndGrain, repeat: number): void {
  const [a, b] = plane(grain)
  const axes = 'xyz'
  material.customProgramCacheKey = () => `end-grain-${grain}`
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uPith = { value: end.pith }
    shader.uniforms.uTangent = { value: end.tangent }
    shader.uniforms.uRepeat = { value: repeat }
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vWoodPos;\nvarying vec3 vWoodNormal;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWoodPos = position;\nvWoodNormal = normal;')
    // Bitarna som läser färgen och normalerna, med ändträets koordinater i stället.
    // De byts in för hand: #include läses in först efter onBeforeCompile.
    const chunk = (name: keyof typeof ShaderChunk) =>
      ShaderChunk[name].replace(/vMapUv/g, 'woodMapUv').replace(/vNormalMapUv/g, 'woodNormalUv')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `varying vec3 vWoodPos;
varying vec3 vWoodNormal;
uniform vec2 uPith;
uniform vec2 uTangent;
uniform float uRepeat;
void main() {
  vec2 woodMapUv = vMapUv;
  vec2 woodNormalUv = vNormalMapUv;
  bool woodEnd = abs(vWoodNormal.${axes[grain]}) > 0.7;
  if (woodEnd) {
    vec2 d = vec2(vWoodPos.${axes[a]}, vWoodPos.${axes[b]}) - uPith;
    // Tvärs ränderna: avståndet från märgen. Längs dem: läget längs bågen (utan
    // vinkel, som skulle ge en skarv där den slår om).
    vec2 polar = vec2(dot(d, uTangent), length(d) * ${RING.toFixed(1)}) / ${UV_MM.toFixed(1)} * uRepeat;
    woodMapUv = polar;
    woodNormalUv = polar;
  }`,
      )
      .replace(
        '#include <map_fragment>',
        `${chunk('map_fragment')}\n  if (woodEnd) diffuseColor.rgb *= ${DARKER.toFixed(2)};`,
      )
      .replace('#include <normal_fragment_begin>', chunk('normal_fragment_begin'))
      .replace('#include <normal_fragment_maps>', chunk('normal_fragment_maps'))
  }
}
