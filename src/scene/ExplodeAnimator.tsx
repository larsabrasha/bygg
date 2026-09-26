import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { useViewStore } from '../store/viewStore'

/** Hur fort sprängskissen glider: andelen av vägen kvar som går på en sekund är 1 − e^(−RATE). */
const RATE = 10

/**
 * Låter delarna glida isär och ihop när sprängskissen slås av och på (och när
 * reglaget flyttas), i stället för att hoppa. explodeShown följer målet en bit
 * varje bildruta tills den är framme.
 */
export function ExplodeAnimator() {
  const invalidate = useThree((s) => s.invalidate)

  // frameloop="demand": ett nytt mål behöver en första bildruta.
  useEffect(
    () =>
      useViewStore.subscribe((s, prev) => {
        if (s.exploded !== prev.exploded || s.explodeAmount !== prev.explodeAmount) invalidate()
      }),
    [invalidate],
  )

  useFrame((_, dt) => {
    const { exploded, explodeAmount, explodeShown, setExplodeShown } = useViewStore.getState()
    const target = exploded ? explodeAmount : 0
    if (explodeShown === target) return
    const next = explodeShown + (target - explodeShown) * (1 - Math.exp(-RATE * Math.min(dt, 0.1)))
    setExplodeShown(Math.abs(target - next) < 0.002 ? target : next)
    invalidate()
  })

  return null
}
