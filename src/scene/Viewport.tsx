import { GizmoHelper, GizmoViewport, Grid } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { resolveBodies } from '../model/resolve'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import { isShown, useViewStore } from '../store/viewStore'
import { explodeOffsets } from '../model/explode'
import { PartNames } from './PartNames'
import { bodyCenter } from '../model/geometry'
import { pushPullAnchor, pushPullTargetOf } from '../tools/actions'
import { toolTargets } from '../model/combine'
import { previewDoc } from '../tools/preview'
import { BodyMesh } from './BodyMesh'
import { HOME } from './camera'
import { CameraRig } from './CameraRig'
import { DimensionGuides } from './DimensionGuides'
import { dimensionsFor, shownDimensionsOf } from './dimensionLabels'
import { AXIS_COLORS, SCENE } from './colors'
import { MoveGizmo } from './MoveGizmo'
import { HoverMarker, OpOverlay } from './OpPreview'
import { PushPullHandle } from './PushPullHandle'
import { RulerOverlay } from './RulerOverlay'
import { SketchMesh } from './SketchMesh'
import { ThumbnailCapturer } from './ThumbnailCapturer'
import { ViewCapturer } from './ViewCapturer'
import { ExplodeAnimator } from './ExplodeAnimator'
import { ToolController } from './ToolController'
import { useColorScheme } from './useColorScheme'

function Scene() {
  // R3F 9 ber inte om en ny bild när ett objekt tas bort (removeChild nollställer
  // föräldern innan invalidateInstance, som då ger upp). Med frameloop="demand"
  // låg en borttagen del kvar på skärmen. Be om en bild efter varje ändring här.
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => invalidate())

  const doc = useDocumentStore((s) => s.doc)
  const selection = useDocumentStore((s) => s.selection)
  const op = useToolStore((s) => s.op)
  const hover = useToolStore((s) => s.hover)
  const hoverPoint = useToolStore((s) => s.hoverPoint)
  const tool = useToolStore((s) => s.tool)
  // Under glidningen ut och in står delarna också isär; läget att titta slutar när de är ihop igen.
  const explodeShown = useViewStore((s) => s.explodeShown)
  const showDims = useViewStore((s) => s.showDims)
  const exploded = useViewStore((s) => s.exploded) || explodeShown > 0

  // Under en operation ritas dokumentet som det skulle bli; berörda delar halvgenomskinliga.
  const copy = useToolStore((s) => s.copy)
  const preview = op ? previewDoc(op, doc, copy) : null
  const shown = preview?.doc ?? doc
  // Dolda delar ritas inte (och går då inte att trycka på), som i Shapr3D. Är något isolerat ritas
  // de andra genomskinliga (faded). Ett verktyg följer sin del.
  const hidden = useViewStore((s) => s.hidden)
  const isolated = useViewStore((s) => s.isolated)
  const bodies = resolveBodies(shown).filter((b) => !hidden.includes(b.tool?.host ?? b.id))
  const fadedIds = new Set(bodies.filter((b) => !isShown({ hidden, isolated }, b.id, b.tool?.host)).map((b) => b.id))
  // I sprängskissen står delarna inte där de är; pilar, mått och skisser skulle hamna fel och visas inte.
  const offsets = exploded ? explodeOffsets(bodies, explodeShown) : null
  const active = op?.kind === 'pushpull' ? op.target : hover
  const selectedBody = selection?.kind === 'body' ? bodies.find((b) => b.id === selection.id) : undefined
  // Pilen på det valda syns i Välj och Rektangel (så att en ny skiss kan dras ut direkt), när inget annat pågår.
  const handleTarget =
    !op && (tool === 'select' || tool === 'rect' || tool === 'circle') && selection ? pushPullTargetOf(selection) : null
  const handle = !exploded && handleTarget && pushPullAnchor(handleTarget, doc)
  const selectedFace = handleTarget?.kind === 'body' ? handleTarget : null
  // I Flytta-läget får den valda delen tre färgade pilar i stället.
  const gizmoAt = !op && !exploded && tool === 'move' && selectedBody ? bodyCenter(selectedBody) : null
  // I Välj visas den valda delens mått vid kanterna (etiketterna i panel/DimensionLabels).
  const dims = exploded ? null : dimensionsFor(doc, op, shownDimensionsOf(showDims, tool, op, selection))

  // Verktyg (tillägg och urskärningar) syns som spöken när deras värd, eller de själva, är valda.
  const shownHost = selectedBody?.tool?.host ?? selectedBody?.id

  return (
    <>
      {bodies.map((b) => {
        // En tapp syns också när delen med tapphålet är vald.
        if (b.tool && !(shownHost && toolTargets(b.tool).includes(shownHost)) && !preview?.affected.has(b.id))
          return null
        // Verktyg på en genomskinlig del visas inte som spöken; de hör till det man inte arbetar med.
        if (b.tool && fadedIds.has(b.id)) return null
        return (
          <BodyMesh
            key={b.id}
            body={b}
            ghost={!!b.tool}
            offset={offsets?.get(b.id)}
            faded={fadedIds.has(b.id)}
            preview={preview?.affected.has(b.id)}
            selected={selectedBody?.id === b.id}
            sibling={!!selectedBody && !b.tool && selectedBody.id !== b.id && selectedBody.defId === b.defId}
            highlightFace={
              active?.kind === 'body' && active.id === b.id
                ? active.face
                : selectedFace?.id === b.id
                  ? selectedFace.face
                  : null
            }
          />
        )
      })}
      {offsets && <PartNames bodies={bodies} offsets={offsets} />}
      {!exploded &&
        shown.sketches.map((s) => (
          <SketchMesh
            key={s.id}
            frame={s.frame}
            rect={s.rect}
            shape={s.shape}
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
      {handle && <PushPullHandle anchor={handle.anchor} normal={handle.normal} />}
      {gizmoAt && <MoveGizmo center={gizmoAt} />}
      {dims && <DimensionGuides key={dims.body.id} body={dims.body} />}
      {op && <OpOverlay op={op} />}
      {!op && hoverPoint && <HoverMarker hover={hoverPoint} />}
      {!exploded && <RulerOverlay />}
    </>
  )
}

// Scenen ritas i millimeter: 1 enhet = 1 mm.
export function Viewport() {
  const colors = SCENE[useColorScheme()]

  return (
    // frameloop="demand": ritar bara om när något ändras. Sparar batteri på mobil.
    <Canvas frameloop="demand" camera={{ position: [...HOME.position], fov: 45, near: 1, far: 50000 }}>
      <color attach="background" args={[colors.background]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[2000, 4000, 3000]} intensity={1.6} />
      <directionalLight position={[-3000, 2000, -1000]} intensity={0.4} />

      {/* Lite under y=0 så att delarnas undersida inte flimrar mot linjerna. Inte med på modellbilderna. */}
      <group userData={{ noThumb: true }}>
        <Grid
          position={[0, -0.5, 0]}
          cellSize={100}
          cellThickness={0.6}
          cellColor={colors.gridCell}
          sectionSize={1000}
          sectionThickness={1.2}
          sectionColor={colors.gridSection}
          fadeDistance={15000}
          fadeStrength={1.5}
          infiniteGrid
        />
      </group>

      <Scene />
      <ToolController />
      <ThumbnailCapturer />
      <ViewCapturer />
      <ExplodeAnimator />

      <CameraRig />
      <GizmoHelper alignment="bottom-left" margin={[70, 70]}>
        <GizmoViewport axisColors={AXIS_COLORS} labelColor="white" />
      </GizmoHelper>
    </Canvas>
  )
}
