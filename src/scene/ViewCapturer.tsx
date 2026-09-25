import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Vector3, type Object3D } from 'three'
import { setViewCapturer } from './viewCapture'

const v = new Vector3()

/**
 * Tar en bild av 3D-vyn med kameran som den står, till utskrift (sprängskissen).
 * Som ThumbnailCapturer: utan rutnät och pilar (userData.noThumb) och med
 * genomskinlig bakgrund, så att den blir vit på papper.
 */
export function ViewCapturer() {
  const { gl, scene, camera, invalidate } = useThree()

  useEffect(() => {
    setViewCapturer((points) => {
      const canvas = gl.domElement
      const { width, height } = canvas
      if (!width || !height) return null
      const hidden: Object3D[] = []
      scene.traverse((o) => {
        if (o.userData.noThumb && o.visible) {
          o.visible = false
          hidden.push(o)
        }
      })
      const background = scene.background
      const clearAlpha = gl.getClearAlpha()
      scene.background = null
      gl.setClearAlpha(0)
      try {
        gl.render(scene, camera)
        const url = canvas.toDataURL('image/png')
        const labels = points.flatMap(({ name, at }) => {
          v.set(...at).project(camera)
          return v.z > 1 ? [] : [{ name, x: (v.x + 1) / 2, y: (1 - v.y) / 2 }]
        })
        return { url, width, height, labels }
      } finally {
        for (const o of hidden) o.visible = true
        scene.background = background
        gl.setClearAlpha(clearAlpha)
        gl.render(scene, camera)
        invalidate()
      }
    })
    return () => setViewCapturer(null)
  }, [gl, scene, camera, invalidate])

  return null
}
