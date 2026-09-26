import { CameraControls, type CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Box3, Sphere, type Scene } from 'three'
import { useDocumentStore } from '../store/documentStore'
import { useViewStore } from '../store/viewStore'
import { HOME } from './camera'

declare global {
  interface Window {
    __camera?: CameraControlsImpl
  }
}

/** Lådan runt allt man kan peka på (delar och skisser), eller bara det valda. */
function boundsOf(scene: Scene, onlyId: string | null): Box3 {
  scene.updateMatrixWorld()
  const box = new Box3()
  scene.traverse((o) => {
    const pick = o.userData.pick as { id: string } | undefined
    if (pick && (onlyId === null || pick.id === onlyId)) box.expandByObject(o)
  })
  return box
}

/**
 * Kameran när 3D-vyn stängdes (den är stängd medan ritningen är öppen), och
 * den senaste "Visa allt" då, så att den inte görs om när vyn öppnas igen.
 */
let saved: { json: string; fit: unknown } | null = null

/**
 * Kameran. Den vrider runt punkten man trycker på (ToolController sätter
 * punkten) och zoomar mot pekaren. Ingen tröghet när man drar: vyn stannar
 * när man släpper. Zoomning och "Visa allt" glider kort.
 */
export function CameraRig() {
  const ref = useRef<CameraControlsImpl>(null)
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const fit = useViewStore((s) => s.fit)

  // Bara i dev: webbläsartester läser kameran härifrån.
  useEffect(() => {
    if (import.meta.env.DEV) window.__camera = ref.current ?? undefined
  })

  // Före effekten för "Visa allt" nedan, som hoppar över den som redan gjorts.
  const restoredFit = useRef<unknown>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    if (saved) {
      c.fromJSON(saved.json, false)
      restoredFit.current = saved.fit
      saved = null
    }
    return () => {
      saved = { json: c.toJSON(), fit: useViewStore.getState().fit }
    }
  }, [])

  useEffect(() => {
    const c = ref.current
    if (!c || !fit || fit === restoredFit.current) return
    const selection = useDocumentStore.getState().selection
    const box = boundsOf(scene, fit.target === 'selection' ? (selection?.id ?? null) : null)
    void c.setFocalOffset(0, 0, 0, fit.animate)
    // Kameran flyttas när den uppdateras, i nästa bild; utan glidning ritar inget annat den bilden.
    invalidate()
    if (box.isEmpty()) {
      void c.setLookAt(...HOME.position, ...HOME.target, fit.animate)
      return
    }
    // En sfär i stället för lådan: fitToBox vrider vyn rakt mot en sida, fitToSphere behåller vinkeln.
    // Lite luft runt modellen.
    const sphere = box.getBoundingSphere(new Sphere())
    sphere.radius = Math.max(sphere.radius * 1.25, 100)
    void c.fitToSphere(sphere, fit.animate)
  }, [fit, scene, invalidate])

  return (
    <CameraControls
      ref={ref}
      makeDefault
      dollyToCursor
      draggingSmoothTime={0}
      smoothTime={0.2}
      minDistance={10}
      maxDistance={40000}
    />
  )
}
