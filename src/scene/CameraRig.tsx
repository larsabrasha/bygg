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
 * Kameran. Den vrider runt punkten man trycker på (ToolController sätter
 * punkten) och zoomar mot pekaren. Ingen tröghet när man drar: vyn stannar
 * när man släpper. Zoomning och "Visa allt" glider kort.
 */
export function CameraRig() {
  const ref = useRef<CameraControlsImpl>(null)
  const scene = useThree((s) => s.scene)
  const fit = useViewStore((s) => s.fit)

  // Bara i dev: webbläsartester läser kameran härifrån.
  useEffect(() => {
    if (import.meta.env.DEV) window.__camera = ref.current ?? undefined
  })

  useEffect(() => {
    const c = ref.current
    if (!c || !fit) return
    const selection = useDocumentStore.getState().selection
    const box = boundsOf(scene, fit.target === 'selection' ? (selection?.id ?? null) : null)
    void c.setFocalOffset(0, 0, 0, true)
    if (box.isEmpty()) {
      void c.setLookAt(...HOME.position, ...HOME.target, true)
      return
    }
    // En sfär i stället för lådan: fitToBox vrider vyn rakt mot en sida, fitToSphere behåller vinkeln.
    // Lite luft runt modellen.
    const sphere = box.getBoundingSphere(new Sphere())
    sphere.radius = Math.max(sphere.radius * 1.25, 100)
    void c.fitToSphere(sphere, true)
  }, [fit, scene])

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
