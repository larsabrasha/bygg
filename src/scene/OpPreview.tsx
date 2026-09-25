import { Html, Line } from '@react-three/drei'
import { useMemo } from 'react'
import { Vector3, type Camera, type Object3D } from 'three'
import { toWorld } from '../model/frame'
import { rectFromCorners } from '../model/geometry'
import { add, scale } from '../model/vec'
import type { HoverPoint, Op, PushPullOp, RotateOp } from '../store/toolStore'
import { opReadout } from '../tools/opReadout'
import { ACCENT, AXIS_COLORS } from './colors'
import { SketchMesh } from './SketchMesh'
import { SnapMarker } from './SnapMarker'

/** Halva längden på hjälplinjen längs axeln, i mm. */
const GUIDE = 20000
/** Push/pull-pilens längd i mm. */
const ARROW = 160

/** Pil längs normalen, som visar åt vilket håll push/pull drar. */
function Arrow({ op }: { op: PushPullOp }) {
  const dir = useMemo(() => new Vector3(...op.normal), [op.normal])
  const tip = add(op.anchor, scale(op.normal, op.distance))
  // ArrowHelper läser riktningen bara när den skapas, därav key.
  return <arrowHelper key={op.normal.join()} args={[dir, new Vector3(), ARROW, ACCENT, 50, 30]} position={tip} />
}

/**
 * Värdet som ändras, vid pilspetsen eller det man flyttar, där blicken är medan
 * man drar. Måttrutan längst ner visar samma värde och är där man skriver.
 * Förskjuten uppåt åt höger, så att pekaren inte skymmer den; på smal skärm
 * längre upp, så att fingret inte gör det.
 */
function Readout({ op }: { op: Op }) {
  const r = opReadout(op, ARROW)
  if (!r) return null
  return (
    // Lågt z-index: under måttrutan och panelerna, som ligger ovanpå 3D-vyn.
    <Html position={r.at} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }} calculatePosition={inView}>
      <span className="block translate-x-3 -translate-y-[calc(100%+12px)] rounded-lg bg-accent px-2 py-1 text-[13px] font-semibold whitespace-nowrap text-on-accent tabular-nums shadow-md narrow:-translate-y-[calc(100%+56px)]">
        {r.text}
      </span>
    </Html>
  )
}

const projected = new Vector3()
/** Bubblans ungefärliga bredd och höjd med förskjutningen, i px; på smal skärm ligger den högre upp. */
const READOUT_W = 110
const READOUT_H = 50
const READOUT_H_NARROW = 94
const MARGIN = 8

/**
 * Som drei:s egen placering, men inom vyn: pilspetsen kan ligga vid kanten
 * eller utanför, och då skulle bubblan hamna under panelen eller klippas.
 */
function inView(el: Object3D, camera: Camera, size: { width: number; height: number }): number[] {
  projected.setFromMatrixPosition(el.matrixWorld).project(camera)
  const x = ((projected.x + 1) * size.width) / 2
  const y = ((1 - projected.y) * size.height) / 2
  const h = size.width <= 720 ? READOUT_H_NARROW : READOUT_H
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))
  return [clamp(x, MARGIN, size.width - READOUT_W - MARGIN), clamp(y, h + MARGIN, size.height - MARGIN)]
}

/** Det som ritas ovanpå förhandsdokumentet: rektangel, pil, värdet och snäppmarkör. */
export function OpOverlay({ op }: { op: Op }) {
  return (
    <>
      <OpShapes op={op} />
      <Readout op={op} />
    </>
  )
}

function OpShapes({ op }: { op: Op }) {
  if (op.kind === 'rect') {
    const r = rectFromCorners(op.first, op.current)
    const at = toWorld(op.frame, [op.current[0], op.current[1], 0])
    return (
      <>
        {(r.x1 > r.x0 || r.y1 > r.y0) && <SketchMesh frame={op.frame} rect={r} emphasis="selected" />}
        <SnapMarker position={at} onTarget={op.onTarget[0] || op.onTarget[1]} />
      </>
    )
  }
  if (op.kind === 'pushpull') {
    return (
      <>
        <Arrow op={op} />
        {op.onTarget && <SnapMarker position={add(op.anchor, scale(op.normal, op.distance))} onTarget />}
      </>
    )
  }
  if (op.kind === 'rotate') return <RotateGuide op={op} />
  const at = add(op.plane.origin, add(scale(op.plane.u, op.delta[0]), scale(op.plane.v, op.delta[1])))
  return (
    <>
      {/* Längs en pil: en linje i axelns färg visar att delen bara kan gå åt det hållet. */}
      {op.axis !== null && (
        <Line
          points={[add(at, scale(op.plane.u, -GUIDE)), add(at, scale(op.plane.u, GUIDE))]}
          color={AXIS_COLORS[op.axis]}
          lineWidth={1.5}
        />
      )}
      <SnapMarker position={at} onTarget={op.onTarget[0] || op.onTarget[1]} />
    </>
  )
}

/** Cirkel i vridplanet, och ekrar från mitten till där man tog tag och dit man vridit. */
function RotateGuide({ op }: { op: RotateOp }) {
  const at = (deg: number, r = op.radius) => {
    const a = (deg * Math.PI) / 180
    return toWorld(op.plane, [r * Math.cos(a), r * Math.sin(a), 0])
  }
  const circle = useMemo(
    () =>
      Array.from({ length: 65 }, (_, i) =>
        toWorld(op.plane, [op.radius * Math.cos((i / 32) * Math.PI), op.radius * Math.sin((i / 32) * Math.PI), 0]),
      ),
    [op.plane, op.radius],
  )
  const color = AXIS_COLORS[op.axis]
  return (
    <>
      <Line points={circle} color={color} lineWidth={1.5} />
      <Line points={[op.plane.origin, at(op.grab)]} color={color} lineWidth={1} dashed dashSize={20} gapSize={12} />
      <Line points={[op.plane.origin, at(op.grab + op.angle)]} color={color} lineWidth={2} />
    </>
  )
}

export function HoverMarker({ hover }: { hover: HoverPoint }) {
  return <SnapMarker position={toWorld(hover.frame, [hover.point[0], hover.point[1], 0])} onTarget={hover.onTarget} />
}
