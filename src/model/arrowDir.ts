import type { Vec3 } from './types'
import { add, dot, length, scale, sub } from './vec'

/**
 * Minsta vinkel mellan dragriktningen längs en båge sedd från kanten och
 * siktlinjen (arrowDir). Under den blir draget ryckigt.
 */
export const MIN_VIEW_ANGLE = Math.PI / 4

const unit = (a: Vec3): Vec3 => scale(a, 1 / length(a))
/** Delen av a som ligger vinkelrätt mot enhetsvektorn v. */
const across = (a: Vec3, v: Vec3): Vec3 => sub(a, scale(v, dot(a, v)))

/**
 * Under den här vinkeln mot siktlinjen pekar en pil (push/pull, flyttpilarna)
 * nästan rakt mot kameran eller bort. Den syns då kort, och ett drag längs den
 * blir ryckigt: en liten rörelse med pekaren blir ett stort mått. Pilen ritas
 * ändå åt det håll delen rör sig (som i Shapr3D), men blir blek och går inte att
 * dra i; man vrider vyn lite eller skriver måttet.
 */
export const HEAD_ON_ANGLE = (20 * Math.PI) / 180

/** Om riktningen dir pekar nästan längs siktlinjen. toCamera = mot kameran, enhetsvektor. */
export function isHeadOn(dir: Vec3, toCamera: Vec3): boolean {
  return length(across(dir, toCamera)) < Math.sin(HEAD_ON_ANGLE) * length(dir)
}

/**
 * Riktningen att dra längs för en båge i Flytta-läget som ses från kanten:
 * tangenten där man tog tag (dir). Pekar den nästan rakt mot kameran (eller
 * bort) lutas den mot skärmens överkant, så att den har minst MIN_VIEW_ANGLE
 * mot siktlinjen. Övergången är mjuk: vid gränsvinkeln är det dir själv, och ju
 * rakare man tittar, desto mer mot skärmens upp. Vridningen räknas ändå längs
 * bågen; bara pekaren följer den lutade linjen.
 * toCamera = från punkten mot kameran, up = skärmens upp i världen. Båda enhetsvektorer.
 */
export function arrowDir(normal: Vec3, toCamera: Vec3, up: Vec3): Vec3 {
  const cos = dot(normal, toCamera)
  const side = across(normal, toCamera)
  const sin = length(side)
  const minSin = Math.sin(MIN_VIEW_ANGLE)
  if (sin >= minSin) return normal

  let screenUp = across(up, toCamera)
  // Tittar man längs upp-vektorn: ta en annan axel, bara för att få en stabil riktning.
  if (length(screenUp) < 1e-3) screenUp = across([0, 0, 1], toCamera)
  // Med ingen sidolutning alls blir det skärmens upp; vid gränsen normalens egen lutning.
  const tilt = unit(add(side, scale(unit(screenUp), minSin - sin)))
  const toward = cos >= 0 ? 1 : -1
  return add(scale(toCamera, toward * Math.cos(MIN_VIEW_ANGLE)), scale(tilt, minSin))
}
