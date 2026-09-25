import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Box3, PerspectiveCamera, Sphere, Vector3, type Object3D } from 'three'
import { setThumbnailCapturer } from '../sync/thumbnails'
import { centerCrop, fitDistance, THUMB } from './thumbnailFit'

const FOV = 35
/** Samma vinkel för alla bilder: snett ovanifrån, som startvyn. */
const VIEW_DIR = new Vector3(1, 0.85, 1.25).normalize()

/**
 * Tar bilder av modellen till startvyn. Renderar med en egen kamera som ser
 * hela modellen, utan rutnät och pil (userData.noThumb) och med genomskinlig
 * bakgrund, direkt i 3D-vyns canvas. Bilden kopieras innan webbläsaren hinner
 * visa den, och vyn ritas sedan om som vanligt.
 */
export function ThumbnailCapturer() {
  const { gl, scene, camera, invalidate } = useThree()

  useEffect(() => {
    const capture = (): string | null => {
      const canvas = gl.domElement
      const { width, height } = canvas
      if (!width || !height) return null

      scene.updateMatrixWorld()
      const box = new Box3()
      scene.traverse((o) => {
        const kind = (o.userData.pick as { kind?: string } | undefined)?.kind
        if (kind === 'body' || kind === 'sketch') box.expandByObject(o)
      })
      if (box.isEmpty()) return null
      const sphere = box.getBoundingSphere(new Sphere())

      const crop = centerCrop(width, height)
      const dist = fitDistance(Math.max(sphere.radius, 50), FOV, width, height, crop)
      const cam = new PerspectiveCamera(
        FOV,
        width / height,
        Math.max(1, dist - sphere.radius * 2),
        dist + sphere.radius * 2,
      )
      cam.position.copy(sphere.center).addScaledVector(VIEW_DIR, dist)
      cam.lookAt(sphere.center)
      cam.updateProjectionMatrix()

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
        gl.render(scene, cam)
        const out = document.createElement('canvas')
        out.width = THUMB.width
        out.height = THUMB.height
        out.getContext('2d')?.drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, THUMB.width, THUMB.height)
        return out.toDataURL('image/png')
      } finally {
        for (const o of hidden) o.visible = true
        scene.background = background
        gl.setClearAlpha(clearAlpha)
        gl.render(scene, camera)
        invalidate()
      }
    }
    setThumbnailCapturer(capture)
    return () => setThumbnailCapturer(null)
  }, [gl, scene, camera, invalidate])

  return null
}
