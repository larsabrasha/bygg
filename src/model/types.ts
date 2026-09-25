/** Alla mått i millimeter. */
export type Vec3 = [number, number, number]
export type Vec2 = [number, number]

/**
 * Lokalt koordinatsystem. u, v och n är ortonormala och u × v = n.
 * En skiss ligger i planet som u och v spänner upp; n pekar ut ur planet.
 */
export interface Frame {
  origin: Vec3
  u: Vec3
  v: Vec3
  n: Vec3
}

/** Rektangel i ett plans (u, v)-koordinater. Alltid x0 < x1 och y0 < y1. */
export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Platt rektangel som ännu inte dragits ut till en kropp. */
export interface Sketch {
  id: string
  frame: Frame
  rect: Rect
}

/** Fiberriktning: längs delens längsta eller näst längsta mått. */
export type Grain = 'length' | 'width'

/**
 * En kropp är en profil (rektangel) i sin frame, utdragen längs n från z0 till z1.
 * Profil och djup sparas som siffror, så måtten går att ändra i efterhand.
 */
export interface Body {
  id: string
  name: string
  material: string
  grain: Grain
  frame: Frame
  profile: Rect
  z0: number
  z1: number
}

export interface ModelDocument {
  sketches: Sketch[]
  bodies: Body[]
}

/** Kroppens sex sidor, i samma ordning som three.js BoxGeometry numrerar dem. */
export type Face = 'u+' | 'u-' | 'v+' | 'v-' | 'n+' | 'n-'
export const FACES: readonly Face[] = ['u+', 'u-', 'v+', 'v-', 'n+', 'n-']

export const MATERIALS = ['furu', 'gran', 'ek', 'björk', 'ask', 'plywood'] as const
