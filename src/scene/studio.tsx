import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { NeutralToneMapping, Object3D, type DirectionalLight } from 'three'
import { bodyCorners } from '../model/drawing'
import type { Body, Vec3 } from '../model/types'

/**
 * Studioljuset i det realistiska utseendet. Används av 3D-vyn och av startsidan
 * före inloggningen (src/landing), så att möblerna där ser ut som i appen.
 */

/** Neutral tonmappning är mörkare än ACES i mellantonerna; det här tar trät till ungefär sin färg. */
export const EXPOSURE = 1.5
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
export function RealisticLight({
  bodies,
  scheme,
  contact = true,
}: {
  bodies: readonly Body[]
  scheme: 'light' | 'dark'
  /** Kontaktskuggan; inte i VR (se nedan). */
  contact?: boolean
}) {
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
        // Skalad i stället för en ny geometri: storleken följer modellen, också i varje bildruta under ett drag.
        scale={[floor, floor, 1]}
        receiveShadow
      >
        <planeGeometry args={[1, 1]} />
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
      {contact && (
        <ContactShadows
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
