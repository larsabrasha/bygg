import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { OrthographicCamera, Vector2, Vector3 } from 'three'
import { bodyCorners } from '../model/drawing'
import type { Body, Vec3 } from '../model/types'
import { BodyMesh } from './BodyMesh'

/** En bild att ta: varifrån, hur stor i pixlar, och luft runt modellen i mm i modellen. */
export interface OrthoShot {
  key: string
  dir: Vec3
  up: Vec3
  width: number
  height: number
  margin: number
}

interface Props {
  parts: readonly Body[]
  shots: readonly OrthoShot[]
  onImages: (images: Record<string, string>) => void
}

/**
 * Tar bilder av modellen hopsatt med parallellprojektion, rakt framifrån,
 * från sidan och ovanifrån (huvudvyerna). En dold canvas: bilderna blir
 * data-URL:er som ritningen visar som <image>, så att de också kommer med i
 * PDF:en. Tas om vid varje ny bildruta, t.ex. när hål och tappar räknats
 * klart (manifold-3d laddas efter hand).
 */
export function OrthoRenderer(props: Props) {
  return (
    <div aria-hidden className="pointer-events-none fixed top-0 left-0 size-px overflow-hidden opacity-0">
      <Canvas orthographic frameloop="demand" dpr={1}>
        <ambientLight intensity={0.75} />
        <directionalLight position={[2000, 4000, 3000]} intensity={1.5} />
        <directionalLight position={[-3000, 2000, -1000]} intensity={0.45} />
        {props.parts.map((b) => (
          <BodyMesh key={b.id} body={b} />
        ))}
        <Shots {...props} />
      </Canvas>
    </div>
  )
}

const v = new Vector3()
const size = new Vector2()

function Shots({ parts, shots, onImages }: Props) {
  const invalidate = useThree((s) => s.invalidate)
  const last = useRef<Record<string, string>>({})

  // Nya delar eller bilder: en ny bildruta, så att useFrame nedan tar bilderna.
  useEffect(() => invalidate(), [parts, shots, invalidate])

  // Prioritet 1: R3F ritar inte själv, bilderna ritas här i stället.
  useFrame(({ gl, scene }) => {
    const corners = parts.flatMap((b) => bodyCorners(b))
    if (corners.length === 0 || shots.length === 0) return
    const lo = [0, 1, 2].map((k) => Math.min(...corners.map((c) => c[k]!)))
    const hi = [0, 1, 2].map((k) => Math.max(...corners.map((c) => c[k]!)))
    const center = new Vector3((lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2)
    const radius = Math.max(50, Math.hypot(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!) / 2)

    gl.getSize(size)
    const ratio = gl.getPixelRatio()
    const clearAlpha = gl.getClearAlpha()
    gl.setClearAlpha(0)
    gl.setPixelRatio(1)
    const images: Record<string, string> = {}
    try {
      for (const shot of shots) {
        const cam = new OrthographicCamera()
        cam.position.copy(center).addScaledVector(new Vector3(...shot.dir), radius * 4)
        cam.up.set(...shot.up)
        cam.lookAt(center)
        cam.updateMatrixWorld()
        let minX = Infinity
        let maxX = -Infinity
        let minY = Infinity
        let maxY = -Infinity
        for (const c of corners) {
          v.set(...c).applyMatrix4(cam.matrixWorldInverse)
          minX = Math.min(minX, v.x)
          maxX = Math.max(maxX, v.x)
          minY = Math.min(minY, v.y)
          maxY = Math.max(maxY, v.y)
        }
        cam.left = minX - shot.margin
        cam.right = maxX + shot.margin
        cam.top = maxY + shot.margin
        cam.bottom = minY - shot.margin
        cam.near = 1
        cam.far = radius * 8
        cam.updateProjectionMatrix()

        gl.setSize(shot.width, shot.height, false)
        gl.render(scene, cam)
        images[shot.key] = gl.domElement.toDataURL('image/png')
      }
    } finally {
      gl.setPixelRatio(ratio)
      gl.setSize(size.x, size.y, false)
      gl.setClearAlpha(clearAlpha)
    }
    // Samma bilder som förra gången: inget nytt att visa (och ingen ny rendering i React).
    const same = shots.every((shot) => last.current[shot.key] === images[shot.key])
    if (!same) {
      last.current = images
      onImages(images)
    }
  }, 1)

  return null
}
