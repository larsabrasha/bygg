import type { Vec3 } from '../../model/types'

/**
 * Hur man står och rör sig i VR. Scenen är i mm; VR-sessionen räknar i meter,
 * och origo för spelaren (XROrigin) är skalat MM_PER_M gånger, så att modellen
 * syns i verklig storlek.
 */
export const MM_PER_M = 1000

/** Hur fort man går med styrspaken, i mm/s. */
export const WALK_MM_PER_S = 1200
/** Så långt måste spaken föras innan något händer (0–1). */
export const DEAD_ZONE = 0.15
/** Ett ryck med högra spaken vrider så här mycket. */
export const SNAP_TURN = Math.PI / 6

/**
 * Var man står när VR startar: framför modellen (på +z-sidan, där betraktaren
 * är i 3D-vyn), med blicken mot den. Minst 1,5 m bort, längre från en stor modell.
 * yaw 0 betyder blicken längs -z.
 */
export function startPlacement(center: Vec3 | null, radius: number): { position: Vec3; yaw: number } {
  if (!center) return { position: [0, 0, 1500], yaw: 0 }
  return { position: [center[0], 0, center[2] + Math.max(1500, radius + 900)], yaw: 0 }
}

/**
 * Förflyttning av origo för spakens läge (x höger, y framåt negativ, som i
 * WebXR) under dt sekunder, i huvudets riktning (yaw) och längs golvet.
 */
export function walkStep(x: number, y: number, yaw: number, dt: number): Vec3 {
  const sx = Math.abs(x) < DEAD_ZONE ? 0 : x
  const sy = Math.abs(y) < DEAD_ZONE ? 0 : y
  const step = WALK_MM_PER_S * dt
  // Framåt är -z vid yaw 0; höger är +x.
  const forward = -sy * step
  const right = sx * step
  return [right * Math.cos(yaw) - forward * Math.sin(yaw), 0, -right * Math.sin(yaw) - forward * Math.cos(yaw)]
}

/**
 * Origo efter en vridning med angle runt huvudets lodlinje: man står kvar
 * där man står och vänder sig, i stället för att svänga runt origo.
 */
export function turnAround(origin: Vec3, head: Vec3, angle: number): Vec3 {
  const dx = origin[0] - head[0]
  const dz = origin[2] - head[2]
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [head[0] + dx * c + dz * s, origin[1], head[2] - dx * s + dz * c]
}

/** Handens läge vid ett grepp: var den är och åt vilket håll den pekar (runt lodlinjen). */
export interface HandYaw {
  pos: Vec3
  yaw: number
}

/**
 * Origo medan man håller i världen (greppknappen): punkten man tog tag i och
 * handens riktning står still i världen, så att världen följer handen när man
 * drar och vrider. Bara vridning runt lodlinjen, och origo stannar på golvet:
 * golvet ligger kvar och skalan 1:1 står fast.
 * start är handen i världen (mm) när greppet började; hand är handen nu i
 * sessionens koordinater (meter); scale är origos skala (MM_PER_M).
 */
export function grabRig(start: HandYaw, hand: HandYaw, scale: number): { position: Vec3; yaw: number } {
  const yaw = start.yaw - hand.yaw
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const [x, , z] = hand.pos
  // Handen i världen = origo + vridning(yaw) · (hand · scale); lös ut origo.
  const hx = (c * x + s * z) * scale
  const hz = (-s * x + c * z) * scale
  return { position: [start.pos[0] - hx, 0, start.pos[2] - hz], yaw }
}
