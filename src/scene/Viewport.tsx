import {
  ContactShadows,
  Environment,
  GizmoHelper,
  GizmoViewport,
  Grid,
  Lightformer,
  type CameraControlsImpl,
} from '@react-three/drei'
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { NeutralToneMapping, Object3D, type DirectionalLight } from 'three'
import { bodyCorners } from '../model/drawing'
import type { Body, Vec3 } from '../model/types'
import { Canvas, useThree } from '@react-three/fiber'
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
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
import { beforeNeutral } from './neutralToneMap'
import { OpenWatcher } from './OpenWatcher'
import { HoverMarker, OpOverlay } from './OpPreview'
import { PushPullHandle } from './PushPullHandle'
import { RulerOverlay } from './RulerOverlay'
import { SketchMesh } from './SketchMesh'
import { ThumbnailCapturer } from './ThumbnailCapturer'
import { ViewCapturer } from './ViewCapturer'
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
  const scheme = useColorScheme()
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
            look={look}
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
      {look === 'realistic' && <RealisticLight bodies={bodies} scheme={scheme} />}
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

/** Neutral tonmappning är mörkare än ACES i mellantonerna; det här tar trät till ungefär sin färg. */
const EXPOSURE = 1.5
/** Hur högt upp från golvet kontaktskuggan ser, i mm. */
const CONTACT_MM = 150
/** Varifrån huvudljuset kommer, i världen (x höger, y upp, z mot betraktaren), i modellens radier. */
const KEY: Vec3 = [-1, 3, 2]
const WARM = '#fff1de'
/**
 * Fyllnadsljuset och ljuset ovanifrån: svagt varma, som ljus som studsat mot
 * trägolv och väggar. Ett neutralt eller blått ljus gör ljust trä i skugga olivgrönt.
 */
const FILL = '#ffeedd'

/**
 * Ljuset i det realistiska utseendet, som i en fotostudio: stora mjuka
 * ljuskällor (softboxar) runt modellen som ger reflexer och mjukt ljus
 * (Lightformer i en egen miljö, byggs i appen och fungerar offline), ett
 * riktat ljus från huvudljusets håll med mjuk skugga, och en kontaktskugga
 * där delarna står på golvet. Golvet syns inte: bakgrunden är ett sömlöst
 * studiopapper, och golvet tar bara emot skuggorna.
 *
 * Huvudljuset kommer snett från vänster ovanifrån, sett från kamerans
 * startläge (höger fram, HOME). Ljus rakt framifrån gör alla synliga sidor
 * lika ljusa och lägger skuggan bakom modellen. Det är svagt varmt, och
 * fyllnadsljuset från andra sidan likaså.
 */
function RealisticLight({ bodies, scheme }: { bodies: readonly Body[]; scheme: 'light' | 'dark' }) {
  const inVr = useInVr()
  // Neutral tonmappning håller trät i sin färg; ACES (standard) gör ljust trä som björk grått.
  // Renderaren hämtas med get(): den ändras här, och värden från en hook får inte ändras.
  const get = useThree((s) => s.get)
  useEffect(() => {
    const { gl, invalidate } = get()
    const before = [gl.toneMapping, gl.toneMappingExposure] as const
    gl.toneMapping = NeutralToneMapping
    gl.toneMappingExposure = EXPOSURE
    invalidate()
    return () => {
      ;[gl.toneMapping, gl.toneMappingExposure] = before
      invalidate()
    }
  }, [get])

  // Ljuset och skuggan täcker modellen, med marginal.
  const corners = bodies.filter((b) => !b.tool).flatMap((b) => bodyCorners(b))
  const target = useMemo(() => new Object3D(), [])
  const sun = useRef<DirectionalLight>(null)
  const lo = [0, 1, 2].map((k) => Math.min(...corners.map((c) => c[k]!)))
  const hi = [0, 1, 2].map((k) => Math.max(...corners.map((c) => c[k]!)))
  const radius = corners.length ? Math.max(200, Math.hypot(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!) / 2) : 0
  // Skuggkamerans gränser följer modellens storlek, men three.js räknar inte om
  // dess projektion själv: utan det gällde skuggan den förra modellen, och en
  // större modell som öppnades fick ingen skugga.
  useLayoutEffect(() => {
    const shadow = sun.current?.shadow
    if (!shadow) return
    shadow.camera.updateProjectionMatrix()
    shadow.needsUpdate = true
    get().invalidate()
  }, [radius, get])
  if (corners.length === 0) return null
  const center: Vec3 = [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2]
  const floor = radius * 3
  const dark = scheme === 'dark'
  return (
    // Ljuset är med på modellbilderna; bara golvet och dess skuggor döljs där. Ett dolt ljus
    // ändrar antalet ljus, och då kompilerar three.js om alla shaders för bilden.
    <group>
      <StudioEnvironment />
      <primitive object={target} position={center} />
      {/* Solen från huvudljusets håll. Skuggkameran rymmer modellen; radius gör kanten mjuk. */}
      <directionalLight
        ref={sun}
        position={[center[0] + radius * KEY[0], center[1] + radius * KEY[1], center[2] + radius * KEY[2]]}
        target={target}
        color={WARM}
        intensity={1.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={1.5}
        shadow-radius={6}
        shadow-camera-left={-radius * 1.5}
        shadow-camera-right={radius * 1.5}
        shadow-camera-top={radius * 1.5}
        shadow-camera-bottom={-radius * 1.5}
        shadow-camera-near={radius}
        shadow-camera-far={radius * 8}
      />
      {/* Golvet tar bara emot skuggan. På mörkt papper syns en svag skugga sämre, så den är lite starkare där. */}
      <mesh
        position={[center[0], 0.3, center[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        userData={{ noThumb: true }}
      >
        <planeGeometry args={[floor, floor]} />
        <shadowMaterial opacity={dark ? 0.34 : 0.32} transparent depthWrite={false} />
      </mesh>
      {/*
        Mörkt där delarna står nära golvet, som i ett hörn: det som får dem att stå på golvet.
        Bara det som ligger under CONTACT_MM räknas. drei ritar utan djuptest, så en del längre
        upp (en bordsskiva) skulle annars skriva över benen under den. Den ser uppåt och ligger
        under golvet: av ett ben syns bara undersidan, och den ligger på golvet.
        Inte i VR: där ritar three.js allt med headsetets kamera, också till texturer, och
        skuggan blev fel.
      */}
      {!inVr && (
        <ContactShadows
          userData={{ noThumb: true }}
          position={[center[0], -1, center[2]]}
          scale={floor}
          far={CONTACT_MM}
          blur={2.5}
          resolution={384}
          opacity={dark ? 0.6 : 0.55}
        />
      )}
    </group>
  )
}

/**
 * Studion som bara syns i reflexer och ljus: en stor softbox ovanför,
 * huvudljuset från samma håll som solen (KEY), ett svagt fyllnadsljus
 * från andra sidan och smala lister bakom som ger kanterna ljus.
 * Enheterna är miljöns egna.
 *
 * En egen komponent med memo: drei ritar om miljön varje gång Environment får
 * nya barn, och RealisticLight ritas om vid varje steg under en operation. Det
 * var onödigt arbete, och i VR ritade three.js miljön med headsetets kamera, så
 * att reflexerna blev fel och bilden drogs ihop i sidled medan man drog.
 */
const StudioEnvironment = memo(function StudioEnvironment() {
  return (
    <Environment resolution={256} environmentIntensity={0.8}>
      <color attach="background" args={['#2e2c2a']} />
      <Lightformer
        form="rect"
        color={FILL}
        intensity={1.2}
        position={[0, 6, 0]}
        rotation-x={Math.PI / 2}
        scale={[10, 10, 1]}
      />
      <Lightformer form="rect" color={WARM} intensity={3} position={[-3, 5, 6]} scale={[6, 5, 1]} target={[0, 0, 0]} />
      <Lightformer
        form="rect"
        color={FILL}
        intensity={0.9}
        position={[7, 1.5, 2]}
        scale={[4, 3, 1]}
        target={[0, 0, 0]}
      />
      <Lightformer form="rect" intensity={1.4} position={[-2, 2, -6]} scale={[8, 0.6, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={1.4} position={[5, 2, -5]} scale={[0.6, 6, 1]} target={[0, 0, 0]} />
    </Environment>
  )
})

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
    // shadows: skuggkartor finns, men bara ljuset i RealisticLight kastar skugga.
    <Canvas shadows frameloop="demand" camera={{ position: [...HOME.position], fov: 45, near: 1, far: 50000 }}>
      <XR store={xrStore}>
        {/* Realistiskt tonmappas bakgrunden med resten av bilden; färgen räknas fram så att den blir colors.studio. */}
        <color attach="background" args={[realistic ? studio : colors.background]} />
        <ambientLight intensity={realistic ? 0 : 0.6} />
        <directionalLight position={[2000, 4000, 3000]} intensity={realistic ? 0 : 1.6} />
        <directionalLight position={[-3000, 2000, -1000]} intensity={realistic ? 0 : 0.4} />

        {/* Lite under y=0 så att delarnas undersida inte flimrar mot linjerna. Inte med på modellbilderna. */}
        <group userData={{ noThumb: true }} visible={!realistic}>
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
        {!inVr && <ViewCapturer />}
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
