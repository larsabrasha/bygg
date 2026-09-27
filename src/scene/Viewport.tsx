import { GizmoHelper, GizmoViewport, Grid, type CameraControlsImpl } from '@react-three/drei'
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { resolveBodies } from '../model/resolve'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import { isShown, useViewStore } from '../store/viewStore'
import { explodeOffsets } from '../model/explode'
import { PartNames } from './PartNames'
import { bodyCenter } from '../model/geometry'
import { pushPullAnchor, pushPullTargetOf, sideHandleFaces } from '../tools/actions'
import { toolTargets } from '../model/combine'
import { previewDoc } from '../tools/preview'
import { BodyMesh } from './BodyMesh'
import { HOME } from './camera'
import { CameraRig } from './CameraRig'
import { DimensionGuides } from './DimensionGuides'
import { dimensionsFor, shownDimensionsOf } from './dimensionLabels'
import { AXIS_COLORS, SCENE } from './colors'
import { MoveGizmo } from './MoveGizmo'
import { beforeNeutral } from './neutralToneMap'
import { OpenWatcher } from './OpenWatcher'
import { HoverMarker, OpOverlay } from './OpPreview'
import { PushPullHandle } from './PushPullHandle'
import { RulerOverlay } from './RulerOverlay'
import { SketchMesh } from './SketchMesh'
import { ShadedLights } from './ShadedLights'
import { EXPOSURE, RealisticLight } from './studio'
import { ThumbnailCapturer } from './ThumbnailCapturer'
import { ExplodeAnimator } from './ExplodeAnimator'
import { ToolController } from './ToolController'
import { useColorScheme } from './useColorScheme'
import { XR } from '@react-three/xr'
import { VrRig } from './xr/VrRig'
import { useInVr, xrStore } from './xr/xrStore'

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
  const look = useViewStore((s) => s.look)
  const peekTools = useViewStore((s) => s.peekTools)
  const scheme = useColorScheme()
  const inVr = useInVr()
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
  // I Välj får den valda delens andra sidor mindre pilar; PushPullHandle visar bara dem som vetter mot en.
  const sideHandles =
    op || exploded || !selectedBody
      ? []
      : sideHandleFaces(selection, tool).flatMap((face) => {
          const at = pushPullAnchor({ kind: 'body', id: selectedBody.id, face }, doc)
          return at ? [{ face, ...at }] : []
        })
  // I Flytta-läget får den valda delen tre färgade pilar i stället.
  const gizmoAt = !op && !exploded && tool === 'move' && selectedBody ? bodyCenter(selectedBody) : null
  // I Välj visas den valda delens mått vid kanterna (etiketterna i panel/DimensionLabels).
  const dims = exploded ? null : dimensionsFor(doc, op, shownDimensionsOf(showDims, tool, op, selection))

  // Verktyg (tillägg och urtag) syns som spöken när deras värd, eller de själva, är valda.
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
            look={look}
            preview={preview?.affected.has(b.id)}
            selected={selectedBody?.id === b.id}
            peek={!!b.tool && !!peekTools?.includes(b.id)}
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
      {look === 'realistic' && <RealisticLight bodies={bodies} scheme={scheme} contact={!inVr} />}
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
      {sideHandles.map((h) => (
        <PushPullHandle key={h.face} face={h.face} anchor={h.anchor} normal={h.normal} />
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

/** Hur långt från ett hörn eller en skarv mörkret når, i mm. */
const AO_RADIUS = 120
/** Telefon eller surfplatta: där är grafikminnet litet. */
const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

/**
 * Efterbehandlingen i det realistiska utseendet: mörkare i hörn och skarvar,
 * där ljuset har svårt att nå (SSAO, med N8AO), som inuti en hylla, under ett
 * bord och där två delar möts. Scenen ritas då först till en buffert, och där
 * gör three.js ingen tonmappning; den görs sist här i stället (samma Neutral
 * och samma exponering som i RealisticLight).
 */
function RealisticEffects() {
  // Medan kameran rör sig ritas bilden utan skuggorna i hörnen; de kommer tillbaka när den
  // står still. Det sparar mest på en telefon, där de kostar mest.
  // n8ao har inga typer; det enda som används är att passet kan slås av.
  const ao = useRef<{ enabled: boolean }>(null)
  const controls = useThree((s) => s.controls) as CameraControlsImpl | null
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    if (!controls) return
    const moving = () => {
      if (ao.current) ao.current.enabled = false
    }
    const still = () => {
      if (ao.current) ao.current.enabled = true
      invalidate()
    }
    controls.addEventListener('wake', moving)
    controls.addEventListener('sleep', still)
    return () => {
      controls.removeEventListener('wake', moving)
      controls.removeEventListener('sleep', still)
    }
  }, [controls, invalidate])
  return (
    // Kantutjämning med 4× multisampling kostar en buffert med flyttal i full upplösning, fyra
    // gånger om: på en telefon hundratals MB, och då tar grafikminnet slut (vyn blir svart).
    // Med pekskärm används SMAA i stället, som bara behöver lite extra minne.
    <EffectComposer multisampling={TOUCH ? 0 : 4}>
      <N8AO ref={ao} aoRadius={AO_RADIUS} distanceFalloff={0.5} intensity={2.5} halfRes quality="performance" />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      {TOUCH && <SMAA />}
    </EffectComposer>
  )
}

// Scenen ritas i millimeter: 1 enhet = 1 mm.
export function Viewport() {
  const colors = SCENE[useColorScheme()]
  // Realistiskt: studioljuset i RealisticLight ersätter det jämna ljuset och huvudljusen,
  // och bakgrunden är studiopapper utan rutnät.
  const realistic = useViewStore((s) => s.look) === 'realistic'
  // Efterbehandlingen och axelkorset ritar med egen kamera och egna buffertar, och
  // fungerar inte i VR. Kameran styrs av headsetet, och bilderna av modellen tas inte där.
  const inVr = useInVr()
  const effects = realistic && !inVr
  const studio = useMemo(() => beforeNeutral(colors.studio, EXPOSURE), [colors.studio])

  return (
    // frameloop="demand": ritar bara om när något ändras. Sparar batteri på mobil.
    // shadows: skuggkartor finns, men bara ljuset i RealisticLight kastar skugga. "percentage" =
    // PCFShadowMap: med bara shadows väljs PCFSoftShadowMap, som three.js har tagit bort (varning i konsolen).
    <Canvas shadows="percentage" frameloop="demand" camera={{ position: [...HOME.position], fov: 45, near: 1, far: 50000 }}>
      <XR store={xrStore}>
        {/* Realistiskt tonmappas bakgrunden med resten av bilden; färgen räknas fram så att den blir colors.studio. */}
        <color attach="background" args={[realistic ? studio : colors.background]} />
        <ShadedLights on={!realistic} />

        {/* Lite under y=0 så att delarnas undersida inte flimrar mot linjerna. */}
        <group visible={!realistic}>
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
        {!inVr && <ThumbnailCapturer />}
        <ExplodeAnimator />
        <OpenWatcher />
        <VrRig />

        {!inVr && <CameraRig />}
        {effects && <RealisticEffects />}
        {/* Axelkorset ritas ovanpå, efter efterbehandlingen när den finns (den ritar med prioritet 1). */}
        {!inVr && (
          <GizmoHelper alignment="bottom-left" margin={[70, 70]} renderPriority={effects ? 2 : 1}>
            <GizmoViewport axisColors={AXIS_COLORS} labelColor="white" />
          </GizmoHelper>
        )}
      </XR>
    </Canvas>
  )
}
