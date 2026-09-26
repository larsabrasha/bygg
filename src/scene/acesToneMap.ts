/** Kurvan i ACES (RRTAndODTFit i three.js), per kanal. */
const fit = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)
const clamp = (v: number) => Math.min(1, Math.max(0, v))

/**
 * ACES Filmic, samma tonmappning som three.js ACESFilmicToneMapping (den som
 * 3D-vyn har i det skuggade utseendet), på linjära färger (0 och uppåt).
 */
export function aces([r, g, b]: readonly number[], exposure = 1): [number, number, number] {
  const s = exposure / 0.6
  const [x, y, z] = [r! * s, g! * s, b! * s]
  // Matriserna rad för rad; i three.js skrivs de kolumn för kolumn.
  const p = fit(0.59719 * x + 0.35458 * y + 0.04823 * z)
  const q = fit(0.076 * x + 0.90834 * y + 0.01566 * z)
  const t = fit(0.0284 * x + 0.13383 * y + 0.83777 * z)
  return [
    clamp(1.60475 * p - 0.53108 * q - 0.07367 * t),
    clamp(-0.10208 * p + 1.10813 * q - 0.00605 * t),
    clamp(-0.00327 * p - 0.07276 * q + 1.07602 * t),
  ]
}
