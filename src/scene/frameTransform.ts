import { Matrix4, Quaternion, Vector3 } from 'three'
import { isMirrored } from '../model/frame'
import type { Frame } from '../model/types'

/**
 * Frame → rotation och skala för en three.js-grupp. Axlarna antas vara ortonormala.
 * En spegelvänd frame (u × v = −n) är ingen vridning: den blir vridningen för (−u, v, n)
 * och skalan −1 längs x. three.js vänder då trianglarnas framsida själv.
 */
export function frameRotation(f: Frame): { quaternion: Quaternion; scale: [number, number, number] } {
  const mirrored = isMirrored(f)
  const u = new Vector3(...f.u)
  if (mirrored) u.negate()
  const m = new Matrix4().makeBasis(u, new Vector3(...f.v), new Vector3(...f.n))
  return { quaternion: new Quaternion().setFromRotationMatrix(m), scale: [mirrored ? -1 : 1, 1, 1] }
}
