/** Storleken på modellbilderna i startvyn, i pixlar (4:3). */
export const THUMB = { width: 480, height: 360 } as const

export interface Crop {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Hur långt från sfärens mitt kameran ska stå för att sfären ska rymmas i
 * utsnittet, med lite luft. Kameran har vertikal synvinkel vfovDeg över hela
 * ytan (width × height); utsnittet är en del av den.
 */
export function fitDistance(radius: number, vfovDeg: number, width: number, height: number, crop: Crop, margin = 1.15) {
  const tanHalf = Math.tan((vfovDeg * Math.PI) / 360)
  const halfY = Math.atan(tanHalf * (crop.h / height))
  const halfX = Math.atan(tanHalf * (width / height) * (crop.w / width))
  return (radius * margin) / Math.sin(Math.min(halfX, halfY))
}
