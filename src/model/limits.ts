import type { Frame, ModelDocument, Rect } from './types'

/**
 * Gränser för hur stor en modell och ett konto får bli. Samma gränser gäller i appen
 * (när man ritar och när man importerar), på servern och i CLI:t (cli/), så att
 * ingen väg in kan skapa det som en annan väg sedan inte kan öppna.
 *
 * Satta med god marginal för möbler och inredning: ett kök med alla skåp är några hundra
 * delar. Varje del är en egen mesh i 3D-vyn, och verktyg (urtag, tappar) räknas med
 * manifold, så tiotusentals delar blir segt på en iPad.
 */
export const LIMITS = {
  /** Modeller per användare. */
  models: 500,
  /** Kopior i en modell, verktyg (urtag, tillägg, tappar) inräknade. */
  instances: 2000,
  /** Former (PartDef). Högst en per kopia, men äldre filer kan ha former utan kopior. */
  defs: 2000,
  /** Skisser som inte dragits ut. */
  sketches: 500,
  params: 200,
  /** Egna material som modellen har kopior av. */
  materials: 200,
  /** Grupper (material och tjocklek) med egna lagermått, och lagermått per grupp. */
  stockGroups: 200,
  stockSizes: 20,
  /** Tecken i ett namn (modell, del, parameter). */
  nameLength: 200,
  /** Tecken i ett uttryck. */
  exprLength: 500,
  /** Största avstånd från origo, i mm, för alla hörn och lagermått: 100 m. */
  extent: 100_000,
} as const

export type LimitKey = Exclude<keyof typeof LIMITS, 'models'>

const TEXT: Record<LimitKey, (max: number) => string> = {
  instances: (max) => `Modellen får ha högst ${max} delar`,
  defs: (max) => `Modellen får ha högst ${max} former`,
  sketches: (max) => `Modellen får ha högst ${max} skisser`,
  params: (max) => `Modellen får ha högst ${max} parametrar`,
  materials: (max) => `Modellen får ha högst ${max} egna material`,
  stockGroups: (max) => `Modellen får ha egna lagermått för högst ${max} grupper`,
  stockSizes: (max) => `En grupp får ha högst ${max} lagermått`,
  nameLength: (max) => `Ett namn får vara högst ${max} tecken`,
  exprLength: (max) => `Ett uttryck får vara högst ${max} tecken`,
  extent: (max) => `Modellen får inte gå längre än ${max / 1000} m från origo`,
}

const cornersOf = (frame: Frame, r: Rect, z0: number, z1: number) =>
  [r.x0, r.x1].flatMap((x) =>
    [r.y0, r.y1].flatMap((y) =>
      [z0, z1].map((z) => [0, 1, 2].map((k) => frame.origin[k]! + frame.u[k]! * x + frame.v[k]! * y + frame.n[k]! * z)),
    ),
  )

/** Största |koordinat| för ett hörn, i världen. */
function maxCoordinate(doc: ModelDocument): number {
  const defs = new Map(doc.defs.map((d) => [d.id, d]))
  let max = 0
  const take = (points: number[][]) => {
    for (const p of points) for (const c of p) max = Math.max(max, Math.abs(c))
  }
  for (const i of doc.instances) {
    const d = defs.get(i.defId)
    if (d) take(cornersOf(i.frame, d.profile, d.z0, d.z1))
  }
  for (const s of doc.sketches) take(cornersOf(s.frame, s.rect, 0, 0))
  for (const sizes of Object.values(doc.stock?.sizes ?? {}))
    for (const s of sizes) max = Math.max(max, s.length, s.width)
  return max
}

/** Det som räknas mot varje gräns. */
export function measure(doc: ModelDocument): Record<LimitKey, number> {
  const names = [...doc.defs.map((d) => d.name), ...doc.params.map((p) => p.name)]
  const exprs = [
    ...doc.params.map((p) => p.expr),
    ...[...doc.defs, ...doc.sketches].flatMap((x) => Object.values(x.dims ?? {}).map((d) => d.expr)),
    ...doc.instances.flatMap((i) => Object.values(i.pos ?? {})),
  ]
  const longest = (texts: readonly string[]) => texts.reduce((m, t) => Math.max(m, t.length), 0)
  const sizes = Object.values(doc.stock?.sizes ?? {})
  return {
    instances: doc.instances.length,
    defs: doc.defs.length,
    sketches: doc.sketches.length,
    params: doc.params.length,
    materials: doc.materials?.length ?? 0,
    stockGroups: sizes.length,
    stockSizes: sizes.reduce((m, s) => Math.max(m, s.length), 0),
    nameLength: longest(names),
    exprLength: longest(exprs),
    extent: maxCoordinate(doc),
  }
}

/**
 * Varför modellen är för stor, eller null. Med before räknas bara det som blivit
 * större: en modell som redan är över en gräns går att krympa, men inte att öka.
 */
export function limitError(doc: ModelDocument, before?: ModelDocument): string | null {
  const now = measure(doc)
  const was = before && measure(before)
  for (const key of Object.keys(TEXT) as LimitKey[]) {
    // Lite marginal för flyttalsbrus på avståndet.
    const max = LIMITS[key] + (key === 'extent' ? 1e-6 : 0)
    if (now[key] > max && (!was || now[key] > was[key])) return `${TEXT[key](LIMITS[key])}.`
  }
  return null
}

/** Felet när kontot redan har så många modeller som det får ha. */
export const modelLimitText = () => `Du kan ha högst ${LIMITS.models} modeller. Ta bort någon först.`
