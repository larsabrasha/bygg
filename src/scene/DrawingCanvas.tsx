import { Canvas, useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import { OrthographicCamera, Raycaster, Vector2, Vector3, type Object3D } from 'three'
import type { CutListRow } from '../model/cutlist'
import { anchorPoint, balloonRadius, bodyCorners, layoutBalloons, type Anchor, type Balloon } from '../model/drawing'
import { explodedCenter } from '../model/explode'
import type { Body, Vec3 } from '../model/types'
import { BodyMesh } from './BodyMesh'

/** Vad som ritas ovanpå bilden: ballongerna, i bildens pixlar. */
export interface DrawingLayout {
  width: number
  height: number
  r: number
  balloons: Balloon[]
}

interface Props {
  /** Delarna utan verktyg; hålen och tapparna finns redan i delarnas form. */
  parts: readonly Body[]
  offsets: ReadonlyMap<string, Vec3>
  /** Varifrån man ser modellen, i grader runt den lodräta axeln. */
  azimuth: number
  /**
   * Med ballonger: kaplistans rader (position = radens nummer, från 1) och vart
   * ballongerna ska. Utan dem ritas bara delarna, med lite luft runt.
   */
  balloons?: { rows: readonly CutListRow[]; onLayout: (layout: DrawingLayout) => void }
  onCanvas: (canvas: HTMLCanvasElement) => void
}

/** Punkter per sida i rutnätet som prövar var en del syns. */
const GRID = 12

/** Snett ovanifrån, nära isometriskt. */
const ELEVATION = 30

/**
 * En bild på ritningen (sprängskissen, eller modellen hopsatt): en egen canvas
 * med parallellprojektion (som en ritning), inte 3D-vyn. Kameran ställs så att
 * alla delar ryms, med plats för ballongerna på sidorna. preserveDrawingBuffer: bilden kan kopieras till
 * PDF:en när som helst.
 */
export function DrawingCanvas(props: Props) {
  return (
    <Canvas
      orthographic
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ preserveDrawingBuffer: true }}
      onCreated={({ gl }) => props.onCanvas(gl.domElement)}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[2000, 4000, 3000]} intensity={1.5} />
      <directionalLight position={[-3000, 2000, -1000]} intensity={0.45} />
      {props.parts.map((b) => (
        <BodyMesh key={b.id} body={b} offset={props.offsets.get(b.id)} />
      ))}
      <Fit {...props} />
    </Canvas>
  )
}

const v = new Vector3()
const ndc = new Vector2()
const raycaster = new Raycaster()

function Fit({ parts, offsets, azimuth, balloons }: Props) {
  // Kameran hämtas med get(): den ändras här, och värden från en hook får inte ändras.
  const get = useThree((s) => s.get)
  const size = useThree((s) => s.size)

  useLayoutEffect(() => {
    const { scene, invalidate } = get()
    const cam = get().camera as OrthographicCamera
    const { width, height } = size
    const corners = parts.flatMap((b) => bodyCorners(b, offsets.get(b.id)))
    if (!width || !height || corners.length === 0) return

    const lo = [0, 1, 2].map((k) => Math.min(...corners.map((c) => c[k]!)))
    const hi = [0, 1, 2].map((k) => Math.max(...corners.map((c) => c[k]!)))
    const center = new Vector3((lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2)
    const radius = Math.max(50, Math.hypot(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!) / 2)

    const az = (azimuth * Math.PI) / 180
    const el = (ELEVATION * Math.PI) / 180
    const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
    cam.position.copy(center).addScaledVector(dir, radius * 4)
    cam.up.set(0, 1, 0)
    cam.lookAt(center)
    cam.updateMatrixWorld()

    // Det ritade i kamerans plan; kameran ser längs −z där.
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

    // Plats på sidorna för ballongerna, och lite luft över och under.
    const r = balloonRadius(width)
    const marginX = balloons ? 6 * r : Math.min(width, height) * 0.08
    const marginY = balloons ? 2 * r : marginX
    const mmPerPx = Math.max((maxX - minX) / (width - 2 * marginX), (maxY - minY) / (height - 2 * marginY))
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    cam.left = cx - (width / 2) * mmPerPx
    cam.right = cx + (width / 2) * mmPerPx
    cam.top = cy + (height / 2) * mmPerPx
    cam.bottom = cy - (height / 2) * mmPerPx
    cam.zoom = 1
    cam.near = 1
    cam.far = radius * 8
    cam.updateProjectionMatrix()

    invalidate()
    if (!balloons) return

    const toPx = (p: Vec3): [number, number] => {
      v.set(...p).project(cam)
      return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height]
    }
    const content = {
      left: (minX - cam.left) / mmPerPx,
      right: (maxX - cam.left) / mmPerPx,
      top: (cam.top - maxY) / mmPerPx,
      bottom: (cam.top - minY) / mmPerPx,
    }
    const mid = (content.left + content.right) / 2

    // Vad man träffar först i en punkt i bilden.
    scene.updateMatrixWorld()
    const meshes: Object3D[] = []
    scene.traverse((o) => {
      if (o.userData.pick) meshes.push(o)
    })
    const hitAt = (x: number, y: number) => {
      ndc.set((x / width) * 2 - 1, 1 - (y / height) * 2)
      raycaster.setFromCamera(ndc, cam)
      const hit = raycaster.intersectObjects(meshes, false)[0]
      return (hit?.object.userData.pick as { id?: string } | undefined)?.id
    }

    // Ett rutnät av punkter över delens bild; ballongen pekar där delen syns (anchorPoint).
    const byId = new Map(parts.map((b) => [b.id, b]))
    const anchorOf = (b: Body) => {
      const px = bodyCorners(b, offsets.get(b.id)).map(toPx)
      const x0 = Math.min(...px.map((p) => p[0]))
      const x1 = Math.max(...px.map((p) => p[0]))
      const y0 = Math.min(...px.map((p) => p[1]))
      const y1 = Math.max(...px.map((p) => p[1]))
      const grid = Array.from({ length: GRID }, (_, i) =>
        Array.from({ length: GRID }, (_, j) => {
          const x = x0 + ((j + 0.5) / GRID) * (x1 - x0)
          const y = y0 + ((i + 0.5) / GRID) * (y1 - y0)
          return { x, y, seen: hitAt(x, y) === b.id }
        }),
      )
      const at = anchorPoint(grid)
      if (at) return at
      // Syns inte alls: mitten, fast något skymmer den.
      const [x, y] = toPx(explodedCenter(b, offsets))
      return { x, y, seen: 0 }
    }

    // En ballong per position. Av kopiorna väljs en som syns bra (minst hälften så
    // mycket som den som syns mest), och av dem den längst ut, så att linjen blir kort.
    const anchors: Anchor[] = balloons.rows.flatMap((row, i) => {
      const candidates = row.bodyIds.flatMap((id) => {
        const b = byId.get(id)
        return b ? [anchorOf(b)] : []
      })
      const most = Math.max(0, ...candidates.map((c) => c.seen))
      const best = candidates
        .filter((c) => c.seen >= most / 2)
        .sort((a, b) => Math.abs(b.x - mid) - Math.abs(a.x - mid))[0]
      return best ? [{ pos: i + 1, x: best.x, y: best.y }] : []
    })

    balloons.onLayout({ width, height, r, balloons: layoutBalloons(anchors, content, { width, height }, r) })
  }, [get, size, parts, offsets, azimuth, balloons])

  return null
}
