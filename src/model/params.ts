import { evaluate, identifiers, type EvalResult } from './expr'
import { MIN_SIZE } from './geometry'
import { applyPositions } from './placement'
import { keepRound, type Box } from './box'
import type { Axis, DimExpr, DimExprs, ModelDocument, Param } from './types'

/**
 * Beräknar alla parametrar. Parametrar får referera till varandra;
 * cykler och okända namn ger fel på de parametrar som berörs.
 */
export function evaluateParams(params: readonly Param[]): Map<string, EvalResult> {
  const byName = new Map(params.map((p) => [p.name, p]))
  const results = new Map<string, EvalResult>()
  const visiting = new Set<string>()

  const resolve = (name: string): EvalResult => {
    const p = byName.get(name)
    if (!p) return { ok: false, error: `Okänd parameter "${name}"` }
    const done = results.get(p.id)
    if (done) return done
    if (visiting.has(name)) return { ok: false, error: `Cirkelreferens via "${name}"` }
    visiting.add(name)
    let firstError: string | null = null
    const r = evaluate(p.expr, (n) => {
      const sub = resolve(n)
      if (sub.ok) return sub.value
      firstError ??= sub.error
      return undefined
    })
    visiting.delete(name)
    const result: EvalResult = !r.ok && firstError ? { ok: false, error: firstError } : r
    results.set(p.id, result)
    return result
  }

  for (const p of params) resolve(p.name)
  return results
}

/** Namn → värde för alla parametrar som gick att beräkna. */
export function paramScope(params: readonly Param[]): Map<string, number> {
  const results = evaluateParams(params)
  const scope = new Map<string, number>()
  for (const p of params) {
    const r = results.get(p.id)
    if (r?.ok) scope.set(p.name, r.value)
  }
  return scope
}

export function evaluateIn(expr: string, params: readonly Param[]): EvalResult {
  const scope = paramScope(params)
  return evaluate(expr, (n) => scope.get(n))
}

/** Sätter längden längs en axel, med anchor-sidan still. Null om längden är för liten. */
function withExtent(lo: number, hi: number, length: number, anchor: DimExpr['anchor']): [number, number] | null {
  if (!(length >= MIN_SIZE)) return null
  return anchor === 'min' ? [lo, lo + length] : [hi - length, hi]
}

/**
 * Sätter en axels längd på en låda (profil + z). Null om längden är för liten.
 * För en cirkel sätts diametern: den andra axeln följer med (se keepRound).
 */
export function setBoxExtent<T extends Box>(box: T, axis: Axis, length: number, anchor: DimExpr['anchor']): T | null {
  const p = box.profile
  if (axis === 'u') {
    const r = withExtent(p.x0, p.x1, length, anchor)
    return r && keepRound({ ...box, profile: { ...p, x0: r[0], x1: r[1] } }, 'u')
  }
  if (axis === 'v') {
    const r = withExtent(p.y0, p.y1, length, anchor)
    return r && keepRound({ ...box, profile: { ...p, y0: r[0], y1: r[1] } }, 'v')
  }
  const r = withExtent(box.z0, box.z1, length, anchor)
  return r && { ...box, z0: r[0], z1: r[1] }
}

function applyDims<T extends Box & { dims?: DimExprs }>(item: T, scope: Map<string, number>): T {
  let out = item
  for (const axis of ['u', 'v', 'n'] as const) {
    const d = item.dims?.[axis]
    if (!d) continue
    const r = evaluate(d.expr, (n) => scope.get(n))
    if (!r.ok) continue
    // Längder är alltid positiva; riktningen bestämdes av anchor när måttet skapades.
    out = setBoxExtent(out, axis, Math.abs(r.value), d.anchor) ?? out
  }
  const same =
    out.z0 === item.z0 &&
    out.z1 === item.z1 &&
    (['x0', 'x1', 'y0', 'y1'] as const).every((k) => out.profile[k] === item.profile[k])
  return same ? item : out
}

/**
 * Räknar om parametervärden och alla mått och lägen som styrs av uttryck.
 * Mått vars uttryck inte går att beräkna lämnas orörda.
 */
export function applyParams(doc: ModelDocument): ModelDocument {
  const results = evaluateParams(doc.params)
  const params = doc.params.map((p) => {
    const r = results.get(p.id)
    return r?.ok && r.value !== p.value ? { ...p, value: r.value } : p
  })
  const scope = paramScope(params)
  const defs = doc.defs.map((d) => (d.dims ? applyDims(d, scope) : d))
  // Läget räknas efter måtten: hörnet närmast origo beror på delens storlek.
  const instances = doc.instances.some((i) => i.pos) ? applyPositions(doc.instances, defs, scope) : doc.instances
  const sketches = doc.sketches.map((s) => {
    if (!s.dims) return s
    const box = applyDims({ profile: s.rect, ...(s.shape && { shape: s.shape }), z0: 0, z1: 1, dims: s.dims }, scope)
    return box.profile === s.rect ? s : { ...s, rect: box.profile }
  })
  return { ...doc, params, defs, sketches, instances }
}

/** Sant om någon parameter eller något mått i dokumentet använder namnet. */
export function isNameUsed(doc: ModelDocument, name: string): boolean {
  const exprs = [
    ...doc.params.map((p) => p.expr),
    ...[...doc.defs, ...doc.sketches].flatMap((x) => Object.values(x.dims ?? {}).map((d) => d.expr)),
    ...doc.instances.flatMap((i) => Object.values(i.pos ?? {})),
  ]
  return exprs.some((e) => identifiers(e).includes(name))
}
