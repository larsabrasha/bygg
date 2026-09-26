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
 * Plywoodens skikt på kanterna: lika tjocka, ett udda antal (ytfanéren åt
 * samma håll), runt 1,5 mm som i vanlig björkplywood. min och ply i mm längs
 * tjockleken (axis, geometrins axel).
 */
export interface Plies {
  axis: 0 | 1 | 2
  min: number
  ply: number
}

export function pliesFor(min: readonly number[], max: readonly number[], axis: 0 | 1 | 2): Plies {
  const thickness = max[axis]! - min[axis]!
  let n = Math.max(3, Math.round(thickness / 1.5))
  if (n % 2 === 0) n++
  return { axis, min: min[axis]!, ply: thickness / n }
}

/**
 * Rundade kanter: hyvlat trä har en liten radie på kanterna som fångar ljuset.
 * Radien i mm, och minst så många pixlar (annars flimrar den på håll och blir
 * en tunn ljus linje i stället). Görs med normalen, geometrin är skarp.
 */
const EDGE_MM = 2
const EDGE_PX = 1

/** Korslagda skikt: fibern går in i kanten, så de är mörkare, som ändträ. */
const CROSS_PLY = 0.8
/** Limfogen mellan skikten, som en tunn mörk linje: dess bredd i skikt, och hur mörk den är. */
const GLUE = 0.08
const GLUE_DARK = 0.7

/**
 * Lägger till ändträet i ett trämaterial, för plywood skikten på kanterna
 * (där syns inget ändträ; alla fyra kanterna visar skikten), och rundade kanter.
 * repeat: texturens upprepning per UV_MM (samma som texture.repeat). Alla
 * delar med samma fiberriktning (och skiktriktning) delar samma program
 * (customProgramCacheKey); märgen och skikten skiljer bara i uniforms.
 */
export function withEndGrain(
  material: Material,
  {
    grain,
    end,
    repeat,
    plies,
    edges,
  }: {
    grain: 0 | 1 | 2
    end: EndGrain
    repeat: number
    plies?: Plies
    /** Formens låda i geometrins koordinater, för de rundade kanterna. Saknas för runda delar. */
    edges?: { min: readonly number[]; max: readonly number[] }
  },
): void {
  const [a, b] = plane(grain)
  const axes = 'xyz'
  material.customProgramCacheKey = () => `end-grain-${grain}-${plies?.axis ?? 'massiv'}`
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uPith = { value: end.pith }
    shader.uniforms.uTangent = { value: end.tangent }
    shader.uniforms.uRepeat = { value: repeat }
    shader.uniforms.uPly = { value: plies ? [plies.min, plies.ply] : [0, 1] }
    shader.uniforms.uBoxMin = { value: edges ? [...edges.min] : [0, 0, 0] }
    shader.uniforms.uBoxMax = { value: edges ? [...edges.max] : [0, 0, 0] }
    shader.uniforms.uEdges = { value: edges ? 1 : 0 }
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        'varying vec3 vWoodPos;\nvarying vec3 vWoodNormal;\nvarying vec3 vWoodAxis[3];\nvoid main() {',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vWoodPos = position;
vWoodNormal = normal;
// Geometrins axlar i kamerans koordinater, där normalen räknas.
vWoodAxis[0] = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
vWoodAxis[1] = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
vWoodAxis[2] = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));`,
      )
    // Bitarna som läser färgen och normalerna, med ändträets koordinater i stället.
    // De byts in för hand: #include läses in först efter onBeforeCompile.
    const chunk = (name: keyof typeof ShaderChunk) =>
      ShaderChunk[name].replace(/vMapUv/g, 'woodMapUv').replace(/vNormalMapUv/g, 'woodNormalUv')
    const ply = plies ? axes[plies.axis] : null
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `varying vec3 vWoodPos;
varying vec3 vWoodNormal;
uniform vec2 uPith;
uniform vec2 uTangent;
uniform float uRepeat;
uniform vec2 uPly;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform float uEdges;
varying vec3 vWoodAxis[3];
void main() {
  vec2 woodMapUv = vMapUv;
  vec2 woodNormalUv = vNormalMapUv;
  vec3 woodTilt = vec3(0.0);
  bool woodPly = ${ply ? `abs(vWoodNormal.${ply}) < 0.7` : 'false'};
  bool woodEnd = !woodPly && abs(vWoodNormal.${axes[grain]}) > 0.7;
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
        `${chunk('map_fragment')}
  if (woodEnd) diffuseColor.rgb *= ${DARKER.toFixed(2)};
  ${
    ply
      ? `if (woodPly) {
    float layer = (vWoodPos.${ply} - uPly.x) / uPly.y;
    float f = fract(layer);
    diffuseColor.rgb *= mix(1.0, ${CROSS_PLY.toFixed(2)}, mod(floor(layer), 2.0));
    diffuseColor.rgb *= mix(${GLUE_DARK.toFixed(2)}, 1.0, smoothstep(0.0, ${GLUE.toFixed(2)}, f) * smoothstep(1.0, ${(1 - GLUE).toFixed(2)}, f));
  }`
      : ''
  }`,
      )
      .replace('#include <normal_fragment_begin>', chunk('normal_fragment_begin'))
      // Lackskiktet har en egen normal; kanten ska glänsa där också.
      .replace(
        '#include <clearcoat_normal_fragment_begin>',
        '#include <clearcoat_normal_fragment_begin>\n#ifdef USE_CLEARCOAT\n  clearcoatNormal = normalize(clearcoatNormal + woodTilt);\n#endif',
      )
      .replace(
        '#include <normal_fragment_maps>',
        `${chunk('normal_fragment_maps')}
  // Rundade kanter: på en plan sida lutar normalen utåt mot de närmaste kanterna
  // (inom radien), upp till 45° vid kanten, där sidorna möts.
  vec3 woodAn = abs(vWoodNormal);
  if (uEdges > 0.5 && max(woodAn.x, max(woodAn.y, woodAn.z)) > 0.99) {
    vec3 lo = vWoodPos - uBoxMin;
    vec3 hi = uBoxMax - vWoodPos;
    // Utanför lådan (en tapp som sticker ut) finns inga rundade kanter.
    if (min(min(lo.x, lo.y), lo.z) > -0.01 && min(min(hi.x, hi.y), hi.z) > -0.01) {
      for (int k = 0; k < 3; k++) {
        if (woodAn[k] > 0.5) continue;
        float d = min(lo[k], hi[k]);
        float r = max(${EDGE_MM.toFixed(1)}, ${EDGE_PX.toFixed(1)} * fwidth(vWoodPos[k]));
        float s = clamp(1.0 - d / r, 0.0, 1.0);
        woodTilt += vWoodAxis[k] * (lo[k] < hi[k] ? -1.0 : 1.0) * s;
      }
      normal = normalize(normal + woodTilt);
    }
  }`,
      )
  }
}
