import { Matrix4, Quaternion, Vector3 } from 'three'
import type { Frame } from '../model/types'

/** Frame → position + rotation för en three.js-grupp. Axlarna antas vara ortonormala. */
export function frameQuaternion(f: Frame): Quaternion {
  const m = new Matrix4().makeBasis(new Vector3(...f.u), new Vector3(...f.v), new Vector3(...f.n))
  return new Quaternion().setFromRotationMatrix(m)
}
