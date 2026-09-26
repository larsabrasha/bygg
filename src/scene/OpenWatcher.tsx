import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { useLibraryStore } from '../store/libraryStore'
import { useManifold } from './csg'

/** Rutan "Öppnar …" stängs ändå efter så här lång tid, om något skulle gå fel. */
const GIVE_UP_MS = 20000

/**
 * Stänger rutan "Öppnar …" (libraryStore.opening) när 3D-vyn har ritat
 * modellen: när manifold-3d finns (om någon del har verktyg) och två bilder
 * har ritats efter det. Den första bilden kompilerar shaders, vilket kan ta
 * en stund på en iPad; den andra visar modellen.
 */
export function OpenWatcher() {
  const opening = useLibraryStore((s) => s.opening !== null)
  const needsManifold = useDocumentStore((s) => s.doc.instances.some((i) => i.combine))
  const manifold = useManifold(opening && needsManifold)
  const ready = opening && (!needsManifold || manifold !== null)
  const invalidate = useThree((s) => s.invalidate)
  const frames = useRef(0)

  useEffect(() => {
    frames.current = 0
    if (ready) invalidate()
  }, [ready, invalidate])

  useFrame(() => {
    if (!ready) return
    if (++frames.current >= 2) useLibraryStore.getState().set({ opening: null })
    else invalidate()
  })

  useEffect(() => {
    if (!opening) return
    const t = setTimeout(() => useLibraryStore.getState().set({ opening: null }), GIVE_UP_MS)
    return () => clearTimeout(t)
  }, [opening])

  return null
}
