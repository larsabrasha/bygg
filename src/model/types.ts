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

/** Axel i en frame: u, v eller n. */
export type Axis = 'u' | 'v' | 'n'

/**
 * Ett mått som styrs av ett uttryck, t.ex. "tjocklek" eller "bredd - 2 * tjocklek".
 * anchor säger vilken sida som ligger still när värdet ändras.
 */
export interface DimExpr {
  expr: string
  anchor: 'min' | 'max'
}

export type DimExprs = Partial<Record<Axis, DimExpr>>

/** Platt rektangel som ännu inte dragits ut till en kropp. */
export interface Sketch {
  id: string
  frame: Frame
  rect: Rect
  /** Uttryck för bredd (u) och höjd (v), om de skrevs in som uttryck. */
  dims?: DimExprs
}

/**
 * Delens form, delad av alla kopior (som en komponent i SketchUp).
 * Profilen (rektangel) i u/v, utdragen längs n från z0 till z1, i lokala koordinater.
 */
export interface PartDef {
  id: string
  name: string
  material: string
  /** Axeln längs fibern. Måttet längs den är delens längd (L). */
  grainAxis: Axis
  /** Axeln för tjockleken (T). Alltid en annan axel än grainAxis; den tredje är bredden (B). */
  thicknessAxis: Axis
  profile: Rect
  z0: number
  z1: number
  dims?: DimExprs
}

/** Världens axlar: x åt höger, y uppåt, z mot betraktaren (som axelkorset i 3D-vyn). */
export type WorldAxis = 'x' | 'y' | 'z'

/** En frames riktning utan läge. */
export type Orientation = Pick<Frame, 'u' | 'v' | 'n'>

/** En placerad kopia av en PartDef. */
export interface Instance {
  id: string
  defId: string
  frame: Frame
  /**
   * Hur kopian låg innan den vreds första gången; vinklarna i detaljpanelen
   * räknas härifrån. Saknas för kopior som aldrig vridits.
   */
  rest?: Orientation
  /** Uttryck för läget av delens hörn närmast origo, per världsaxel, om läget skrevs som ett uttryck. */
  pos?: Partial<Record<WorldAxis, string>>
}

/** Namngivet värde som mått kan referera till. value är senast beräknade värde. */
export interface Param {
  id: string
  name: string
  expr: string
  value: number
}

export interface ModelDocument {
  sketches: Sketch[]
  defs: PartDef[]
  instances: Instance[]
  params: Param[]
}

/**
 * En kopia ihopslagen med sin form: det som ritas, mäts och hamnar i kaplistan.
 * id är kopians id. Härleds ur dokumentet, sparas aldrig.
 */
export interface Body {
  id: string
  defId: string
  name: string
  material: string
  grainAxis: Axis
  thicknessAxis: Axis
  frame: Frame
  profile: Rect
  z0: number
  z1: number
}

/** Kroppens sex sidor, i samma ordning som three.js BoxGeometry numrerar dem. */
export type Face = 'u+' | 'u-' | 'v+' | 'v-' | 'n+' | 'n-'
export const FACES: readonly Face[] = ['u+', 'u-', 'v+', 'v-', 'n+', 'n-']

export const MATERIALS = ['furu', 'gran', 'ek', 'björk', 'ask', 'plywood'] as const
