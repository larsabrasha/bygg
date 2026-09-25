import { CameraControlsImpl } from '@react-three/drei'
import type { CameraAction, CameraButtons } from '../tools/gestures'

/** Kamerans startläge, och läget "Visa allt" går till när modellen är tom. */
export const HOME = { position: [1500, 1200, 1500], target: [0, 0, 0] } as const

const { ACTION } = CameraControlsImpl

const MOUSE: Record<CameraAction, number> = {
  none: ACTION.NONE,
  rotate: ACTION.ROTATE,
  dolly: ACTION.DOLLY,
  truck: ACTION.TRUCK,
  dollyTruck: ACTION.DOLLY,
  dollyRotate: ACTION.ROTATE,
}

const TOUCH: Record<CameraAction, number> = {
  none: ACTION.NONE,
  rotate: ACTION.TOUCH_ROTATE,
  dolly: ACTION.TOUCH_DOLLY,
  truck: ACTION.TOUCH_TRUCK,
  dollyTruck: ACTION.TOUCH_DOLLY_TRUCK,
  dollyRotate: ACTION.TOUCH_DOLLY_ROTATE,
}

/** Sätter vad knappar och fingrar gör. camera-controls läser det vid varje pekarrörelse. */
export function applyCameraButtons(c: CameraControlsImpl, b: CameraButtons) {
  c.mouseButtons.left = MOUSE[b.left] as typeof c.mouseButtons.left
  c.mouseButtons.middle = MOUSE[b.middle] as typeof c.mouseButtons.middle
  c.mouseButtons.right = MOUSE[b.right] as typeof c.mouseButtons.right
  c.touches.one = TOUCH[b.one] as typeof c.touches.one
  c.touches.two = TOUCH[b.two] as typeof c.touches.two
  c.touches.three = TOUCH[b.three] as typeof c.touches.three
}
