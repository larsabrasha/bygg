import type { RootState } from '@react-three/fiber'
import type { PerspectiveCamera, Vector3 } from 'three'

/**
 * Var den som tittar är, i världen: headsetet under en VR-session, annars
 * 3D-vyns kamera. I VR ritar three.js med headsetets kamera; kameran i R3F:s
 * state står kvar där den var i 3D-vyn och säger inget om var man står.
 */
export function eyePosition({ gl, camera }: Pick<RootState, 'gl' | 'camera'>, target: Vector3): Vector3 {
  return gl.xr.isPresenting ? gl.xr.getCamera().getWorldPosition(target) : target.copy(camera.position)
}

/** I VR: hur stor en "pixel" är sett från ögat, i radianer. En pil på 66 px blir 8 cm på en meters håll. */
const VR_RAD_PER_PX = 0.0012

/**
 * Skalan för något som ritas i pixlar (1 enhet = 1 px, pilarna) på avståndet
 * distance från ögat: lika stort på skärmen oavsett avstånd. I VR en fast vinkel
 * i stället, eftersom skärmens pixlar inte betyder något där.
 */
export function pixelScale({ gl, camera, size }: Pick<RootState, 'gl' | 'camera' | 'size'>, distance: number) {
  if (gl.xr.isPresenting) return distance * VR_RAD_PER_PX
  const fov = ((camera as PerspectiveCamera).fov * Math.PI) / 180
  return (2 * distance * Math.tan(fov / 2)) / size.height
}
