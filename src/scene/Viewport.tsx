import { GizmoHelper, GizmoViewport, Grid, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { resolveBodies } from '../model/resolve'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import { previewDoc } from '../tools/preview'
import { BodyMesh } from './BodyMesh'
import { HoverMarker, OpOverlay } from './OpPreview'
import { SketchMesh } from './SketchMesh'
import { ToolController } from './ToolController'

function Scene() {
  const doc = useDocumentStore((s) => s.doc)
  const selection = useDocumentStore((s) => s.selection)
  const op = useToolStore((s) => s.op)
  const hover = useToolStore((s) => s.hover)
  const hoverPoint = useToolStore((s) => s.hoverPoint)

  // Under en operation ritas dokumentet som det skulle bli; berörda delar halvgenomskinliga.
  const preview = op ? previewDoc(op, doc) : null
  const shown = preview?.doc ?? doc
  const bodies = resolveBodies(shown)
  const active = op?.kind === 'pushpull' ? op.target : hover
  const selectedBody = selection?.kind === 'body' ? bodies.find((b) => b.id === selection.id) : undefined

  return (
    <>
      {bodies.map((b) => (
        <BodyMesh
          key={b.id}
          body={b}
          preview={preview?.affected.has(b.id)}
          selected={selectedBody?.id === b.id}
          sibling={!!selectedBody && selectedBody.id !== b.id && selectedBody.defId === b.defId}
          highlightFace={active?.kind === 'body' && active.id === b.id ? active.face : null}
        />
      ))}
      {shown.sketches.map((s) => (
        <SketchMesh
          key={s.id}
          frame={s.frame}
          rect={s.rect}
          pickId={s.id}
          emphasis={
            selection?.kind === 'sketch' && selection.id === s.id
              ? 'selected'
              : active?.kind === 'sketch' && active.id === s.id
                ? 'hover'
                : 'none'
          }
        />
      ))}
      {op && <OpOverlay op={op} />}
      {!op && hoverPoint && <HoverMarker hover={hoverPoint} />}
    </>
  )
}

// Scenen ritas i millimeter: 1 enhet = 1 mm.
export function Viewport() {
  const opActive = useToolStore((s) => s.op !== null)

  return (
    // frameloop="demand": ritar bara om när något ändras. Sparar batteri på mobil.
    <Canvas frameloop="demand" camera={{ position: [1500, 1200, 1500], fov: 45, near: 1, far: 50000 }}>
      <color attach="background" args={['#f2f1ee']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[2000, 4000, 3000]} intensity={1.6} />
      <directionalLight position={[-3000, 2000, -1000]} intensity={0.4} />

      {/* Lite under y=0 så att delarnas undersida inte flimrar mot linjerna. */}
      <Grid
        position={[0, -0.5, 0]}
        cellSize={100}
        cellThickness={0.6}
        cellColor="#c9c6bf"
        sectionSize={1000}
        sectionThickness={1.2}
        sectionColor="#8f8a80"
        fadeDistance={15000}
        fadeStrength={1.5}
        infiniteGrid
      />

      <Scene />
      <ToolController />

      {/* Kameran står still under en operation, så att dragningen styr måttet. */}
      <OrbitControls makeDefault enabled={!opActive} target={[0, 0, 0]} />
      <GizmoHelper alignment="bottom-left" margin={[70, 70]}>
        <GizmoViewport labelColor="white" />
      </GizmoHelper>
    </Canvas>
  )
}
