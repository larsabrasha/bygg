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
 * drar, lyfter och vrider. Drar man handen uppåt följer världen med uppåt,
 * och man själv sjunker. Bara vridning runt lodlinjen, och skalan står fast.
 * start är handen i världen (mm) när greppet började; hand är handen nu i
 * sessionens koordinater (meter); scale är origos skala (MM_PER_M i verklig storlek).
 */
export function grabRig(start: HandYaw, hand: HandYaw, scale: number): { position: Vec3; yaw: number } {
  const yaw = start.yaw - hand.yaw
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const [x, y, z] = hand.pos
  // Handen i världen = origo + vridning(yaw) · (hand · scale); lös ut origo.
  const hx = (c * x + s * z) * scale
  const hz = (-s * x + c * z) * scale
  return { position: [start.pos[0] - hx, start.pos[1] - y * scale, start.pos[2] - hz], yaw }
}

/**
 * Hur högt origo flyttas för högra spakens läge under dt sekunder, i mm: framåt
 * (y negativ) uppåt, bakåt nedåt, lika fort som man går. Bara när spaken förs
 * mer framåt eller bakåt än åt sidan; åt sidan vrider man sig (SNAP_TURN).
 */
export function liftStep(x: number, y: number, dt: number): number {
  if (Math.abs(y) < DEAD_ZONE || Math.abs(y) <= Math.abs(x)) return 0
  return -y * WALK_MM_PER_S * dt
}

/** Origos läge, vridning runt lodlinjen och skala (MM_PER_M = verklig storlek). */
export interface RigPose {
  position: Vec3
  yaw: number
  scale: number
}

/** Hur stor modellen kan bli med båda händerna: 4 gånger verklig storlek, och 30 gånger mindre. */
export const MIN_SCALE = MM_PER_M / 4
export const MAX_SCALE = MM_PER_M * 30
/** Så nära verklig storlek snäpper den till 1:1, som skalan 100 % i Shapr3D. */
const SNAP_REAL = 0.06

const rotY = (yaw: number, [x, y, z]: Vec3): Vec3 => {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return [c * x + s * z, y, -s * x + c * z]
}

/**
 * Origo medan man håller i världen med båda händerna (båda greppknapparna),
 * som att zooma med två fingrar: drar man isär händerna blir modellen större,
 * för man ihop dem blir den mindre, och vrider man dem vrids den runt
 * lodlinjen. Punkten mitt mellan händerna står still i världen.
 * start är origo när greppet började; from är händerna då och now är de nu,
 * i sessionens koordinater (meter).
 */
export function twoHandRig(start: RigPose, from: [Vec3, Vec3], now: [Vec3, Vec3]): RigPose {
  const mid = ([a, b]: [Vec3, Vec3]): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
  const span = ([a, b]: [Vec3, Vec3]) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  // Riktningen från vänster hand mot höger, runt lodlinjen (som three.js räknar rotation.y).
  const angle = ([a, b]: [Vec3, Vec3]) => Math.atan2(b[0] - a[0], b[2] - a[2])
  let scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (start.scale * span(from)) / Math.max(span(now), 0.01)))
  if (Math.abs(MM_PER_M / scale - 1) < SNAP_REAL) scale = MM_PER_M
  // Riktningen mellan händerna står still i världen: origo vrids lika mycket åt andra hållet.
  const yaw = start.yaw + angle(from) - angle(now)
  const m0 = rotY(start.yaw, mid(from).map((v) => v * start.scale) as Vec3)
  const held: Vec3 = [start.position[0] + m0[0], start.position[1] + m0[1], start.position[2] + m0[2]]
  const m1 = rotY(yaw, mid(now).map((v) => v * scale) as Vec3)
  return { position: [held[0] - m1[0], held[1] - m1[1], held[2] - m1[2]], yaw, scale }
}

/** Skalan som text, när den inte är verklig storlek: "1:5" för fem gånger mindre, "2:1" för dubbelt så stor. */
export function scaleLabel(scale: number): string | null {
  if (scale === MM_PER_M) return null
  const factor = MM_PER_M / scale
  const n = factor < 1 ? 1 / factor : factor
  const text = (n < 10 ? Math.round(n * 10) / 10 : Math.round(n)).toString().replace('.', ',')
  return factor < 1 ? `1:${text}` : `${text}:1`
}
