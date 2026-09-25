import { GizmoHelper, GizmoViewport, Grid, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import { BodyMesh } from './BodyMesh'
import { pushPullPreview } from '../tools/preview'
import { OpPreview } from './OpPreview'
import { SketchMesh } from './SketchMesh'
import { ToolController } from './ToolController'

function Scene() {
  const doc = useDocumentStore((s) => s.doc)
  const selection = useDocumentStore((s) => s.selection)
  const op = useToolStore((s) => s.op)
  const hover = useToolStore((s) => s.hover)

  // Under push/pull ersätts målet av förhandsvisningen.
  const ppTarget = op?.kind === 'pushpull' ? op.target : null
  const hideTarget = op?.kind === 'pushpull' && pushPullPreview(op, doc) !== null
  const active = ppTarget ?? hover

  return (
    <>
      {doc.bodies.map((b) =>
        hideTarget && ppTarget?.id === b.id ? null : (
          <BodyMesh
            key={b.id}
            body={b}
            selected={selection?.kind === 'body' && selection.id === b.id}
            highlightFace={active?.kind === 'body' && active.id === b.id ? active.face : null}
          />
        ),
      )}
      {doc.sketches.map((s) =>
        hideTarget && ppTarget?.id === s.id ? null : (
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
        ),
      )}
      {op && <OpPreview op={op} doc={doc} />}
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

      {/* Lite under y=0 så att kropparnas undersida inte flimrar mot linjerna. */}
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
