/**
 * Texturkoordinater som lägger träets ådring längs delens fiber, i millimeter
 * genom GRAIN_MM och ACROSS_MM (texturen upprepas). Per hörn: sidan det sitter
 * på (normalens största led) och de två axlarna i den sidans plan. Ligger
 * fibern i planet går u längs den; på en ände (fibern rakt ut) syns ådringen
 * tvärs, som ändträ. offset flyttar mönstret, så att delarna inte ser likadana ut.
 */
export const GRAIN_MM = 600
export const ACROSS_MM = 150

export function grainUvs(
  positions: ArrayLike<number>,
  normals: ArrayLike<number>,
  grain: 0 | 1 | 2,
  offset: [number, number] = [0, 0],
): Float32Array {
  const count = positions.length / 3
  const uv = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    const n = [Math.abs(normals[i * 3]!), Math.abs(normals[i * 3 + 1]!), Math.abs(normals[i * 3 + 2]!)]
    const face = n[0]! >= n[1]! && n[0]! >= n[2]! ? 0 : n[1]! >= n[2]! ? 1 : 2
    const [a, b] = [0, 1, 2].filter((k) => k !== face) as [number, number]
    const p = (k: number) => positions[i * 3 + k]!
    if (face !== grain) {
      const across = a === grain ? b : a
      uv[i * 2] = p(grain) / GRAIN_MM + offset[0]
      uv[i * 2 + 1] = p(across) / ACROSS_MM + offset[1]
    } else {
      uv[i * 2] = p(a) / ACROSS_MM + offset[0]
      uv[i * 2 + 1] = p(b) / ACROSS_MM + offset[1]
    }
  }
  return uv
}

/** Ett tal i [0, 1) ur en text, så att samma del alltid får samma mönster. */
export function hash01(text: string, salt = 0): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}
