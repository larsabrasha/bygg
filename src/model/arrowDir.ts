import type { Vec3 } from './types'
import { add, dot, length, scale, sub } from './vec'

/**
 * Minsta vinkel mellan en pil (push/pull, flyttpilarna) och siktlinjen. Under den blir pilen
 * så kort på skärmen att den ser ut som en prick, och draget blir ryckigt
 * (en liten rörelse med musen blir ett stort mått).
 */
export const MIN_VIEW_ANGLE = Math.PI / 4

const unit = (a: Vec3): Vec3 => scale(a, 1 / length(a))
/** Delen av a som ligger vinkelrätt mot enhetsvektorn v. */
const across = (a: Vec3, v: Vec3): Vec3 => sub(a, scale(v, dot(a, v)))

/**
 * Riktningen som en pil ritas i och som draget följer. Normalt pilens egen
 * riktning (ytans normal, flyttaxeln). Pekar den nästan rakt mot kameran
 * (eller rakt bort) lutas pilen mot skärmens överkant, så att den alltid
 * syns som en pil med minst MIN_VIEW_ANGLE mot siktlinjen. Övergången är
 * mjuk: vid gränsvinkeln är det pilens egen riktning, och ju rakare man
 * tittar, desto mer mot skärmens upp.
 *
 * Det som dras flyttas fortfarande längs pilens egen riktning; bara pekaren
 * följer den lutade linjen, med samma mått per pixel som längs en pil i profil.
 * toCamera = från pilens fot mot kameran, up = skärmens upp i världen. Båda enhetsvektorer.
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
