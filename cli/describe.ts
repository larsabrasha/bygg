import { buildCutList } from '../src/model/cutlist'
import { formatMm, rowNames } from '../src/model/cutlistExport'
import { buildCutPlan, groupCount, materialList, stockDims } from '../src/model/cutPlan'
import { toWorld } from '../src/model/frame'
import { LIMITS } from '../src/model/limits'
import { materialTitle } from '../src/model/materials'
import { evaluateParams } from '../src/model/params'
import { partDims } from '../src/model/partAxes'
import { instanceCounts, resolveBodies } from '../src/model/resolve'
import type { Body, ModelDocument, Vec3 } from '../src/model/types'

/** Modellen som text och JSON, för CLI:t. Samma uträkningar som appens paneler. */

const r1 = (n: number) => Math.round(n * 10) / 10

/** Lådan runt delen i världen: minsta och största hörn. */
function worldBox(b: Body): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const x of [b.profile.x0, b.profile.x1])
    for (const y of [b.profile.y0, b.profile.y1])
      for (const z of [b.z0, b.z1]) {
        const p = toWorld(b.frame, [x, y, z])
        for (const k of [0, 1, 2] as const) {
          min[k] = Math.min(min[k], p[k])
          max[k] = Math.max(max[k], p[k])
        }
      }
  return { min: min.map(r1) as Vec3, max: max.map(r1) as Vec3 }
}

export interface PartSummary {
  id: string
  name: string
  material: string
  paint?: { color: string; code?: string }
  /** Kaplistans mått: L längs fibern, B, T. */
  L: number
  B: number
  T: number
  /** Rund del (cylinder): diametern och längden längs cylindern. */
  round?: { diameter: number; length: number }
  min: Vec3
  max: Vec3
  /** Formen; länkade kopior har samma. */
  defId: string
  linkedCopies: number
  /** Verktyg: vad det gör och med vilken del. */
  tool?: { op: string; host: string; into?: string }
  /** Uttryck som styr måtten ("size.x") och läget ("at.x"), längs världens axlar. */
  exprs?: Record<string, string>
}

export interface ModelSummary {
  name: string
  counts: { parts: number; tools: number; params: number; sketches: number }
  limits: { instances: number; extentMm: number }
  params: { name: string; expr: string; value: number | null; error?: string }[]
  parts: PartSummary[]
}

export function summarize(name: string, doc: ModelDocument): ModelSummary {
  const bodies = resolveBodies(doc)
  const counts = instanceCounts(doc)
  const defs = new Map(doc.defs.map((d) => [d.id, d]))
  const insts = new Map(doc.instances.map((i) => [i.id, i]))
  const results = evaluateParams(doc.params)
  const parts = bodies.map((b): PartSummary => {
    const dims = partDims(b.blank ? { ...b.blank, grainAxis: b.grainAxis, thicknessAxis: b.thicknessAxis } : b)
    const d = defs.get(b.defId)
    const inst = insts.get(b.id)
    // Formens axlar (u, v, n) som världens, så att det går att skriva tillbaka med size.
    const world = (a: string) => {
      const k = b.frame[a as 'u' | 'v' | 'n'].findIndex((c) => Math.abs(Math.abs(c) - 1) < 1e-6)
      return k < 0 ? a : 'xyz'[k]!
    }
    const exprs = {
      ...Object.fromEntries(Object.entries(d?.dims ?? {}).map(([k, v]) => [`size.${world(k)}`, v.expr])),
      ...Object.fromEntries(Object.entries(inst?.pos ?? {}).map(([k, v]) => [`at.${k}`, v])),
    }
    return {
      id: b.id,
      name: b.name,
      material: b.material,
      ...(b.paint && { paint: b.paint }),
      L: r1(dims.length),
      B: r1(dims.width),
      T: r1(dims.thickness),
      ...(b.shape === 'circle' && {
        round: { diameter: r1(b.profile.x1 - b.profile.x0), length: r1(b.z1 - b.z0) },
      }),
      ...worldBox(b),
      defId: b.defId,
      linkedCopies: counts.get(b.defId) ?? 1,
      ...(b.tool && {
        tool: { op: b.tool.op, host: b.tool.host, ...(b.tool.into && { into: b.tool.into }) },
      }),
      ...(Object.keys(exprs).length && { exprs }),
    }
  })
  return {
    name,
    counts: {
      parts: parts.filter((p) => !p.tool).length,
      tools: parts.filter((p) => p.tool).length,
      params: doc.params.length,
      sketches: doc.sketches.length,
    },
    limits: { instances: LIMITS.instances, extentMm: LIMITS.extent },
    params: doc.params.map((p) => {
      const r = results.get(p.id)
      return r?.ok
        ? { name: p.name, expr: p.expr, value: r.value }
        : { name: p.name, expr: p.expr, value: null, error: r?.error }
    }),
    parts,
  }
}

const short = (id: string) => id.slice(0, 8)
const volume = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 3 })
const range = (min: number, max: number) => `${formatMm(min)}..${formatMm(max)}`

export function summaryText(m: ModelSummary): string {
  const lines = [
    `${m.name}: ${m.counts.parts} delar, ${m.counts.tools} verktyg, ${m.counts.params} parametrar` +
      (m.counts.sketches ? `, ${m.counts.sketches} skisser` : ''),
    'Mått i mm. x åt höger, y uppåt, z framåt. L längs fibern, B bredd, T tjocklek.',
  ]
  if (m.params.length) {
    lines.push('', 'Parametrar:')
    for (const p of m.params)
      lines.push(
        `  ${p.name} = ${p.expr}` +
          (p.value === null ? `  (fel: ${p.error})` : p.expr === String(p.value) ? '' : `  = ${formatMm(p.value)}`),
      )
  }
  const row = (p: PartSummary) => {
    const size = p.round
      ? `Ø ${formatMm(p.round.diameter)} × ${formatMm(p.round.length)}`
      : `${formatMm(p.L)} × ${formatMm(p.B)} × ${formatMm(p.T)}`
    const where = `x ${range(p.min[0], p.max[0])}  y ${range(p.min[1], p.max[1])}  z ${range(p.min[2], p.max[2])}`
    const linked = p.linkedCopies > 1 ? `  [form ${short(p.defId)}, ${p.linkedCopies} länkade]` : ''
    const paint = p.paint ? `  målad ${p.paint.code ?? p.paint.color}` : ''
    const exprs = p.exprs
      ? `  {${Object.entries(p.exprs)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')}}`
      : ''
    return `  ${short(p.id)}  ${p.name}  ${materialTitle(p.material)}  ${size}  ${where}${linked}${paint}${exprs}`
  }
  const parts = m.parts.filter((p) => !p.tool)
  const tools = m.parts.filter((p) => p.tool)
  lines.push('', parts.length ? 'Delar (id  namn  material  L × B × T  läge):' : 'Inga delar än.')
  lines.push(...parts.map(row))
  if (tools.length) {
    const names = new Map(m.parts.map((p) => [p.id, p.name]))
    const verb = { subtract: 'skärs ur', add: 'sitter på', joint: 'tapp på' } as Record<string, string>
    lines.push('', 'Verktyg:')
    for (const t of tools) {
      const into = t.tool!.into ? ` in i ${names.get(t.tool!.into)} (${short(t.tool!.into)})` : ''
      lines.push(`${row(t)}  – ${verb[t.tool!.op]} ${names.get(t.tool!.host)} (${short(t.tool!.host)})${into}`)
    }
  }
  return lines.join('\n')
}

export function cutListJson(doc: ModelDocument) {
  const list = buildCutList(resolveBodies(doc))
  return {
    totalCount: list.totalCount,
    totalVolumeM3: Math.round(list.totalVolumeM3 * 1e6) / 1e6,
    rows: list.rows.map((r) => ({
      count: r.count,
      names: r.names,
      material: r.material,
      L: r.length,
      B: r.width,
      T: r.thickness,
      ...(r.round && { round: r.round }),
      ...(r.paint && { paint: r.paint }),
    })),
  }
}

export function cutListText(doc: ModelDocument): string {
  const list = buildCutList(resolveBodies(doc))
  if (list.rows.length === 0) return 'Kaplistan är tom.'
  const lines = ['Antal  L × B × T (mm)  Material  Namn']
  for (const r of list.rows) {
    const paint = r.paint ? ` (målad ${r.paint.code ?? r.paint.color})` : ''
    lines.push(
      `${String(r.count).padStart(5)}  ${[r.length, r.width, r.thickness].map(formatMm).join(' × ')}  ${materialTitle(r.material)}${paint}  ${rowNames(r)}`,
    )
  }
  lines.push(`Totalt ${list.totalCount} delar, ${volume.format(list.totalVolumeM3)} m³`)
  return lines.join('\n')
}

export function cutPlanJson(doc: ModelDocument) {
  const plan = buildCutPlan(resolveBodies(doc), doc.stock)
  return {
    kerf: plan.kerf,
    lengthAllowance: plan.lengthAllowance,
    buy: materialList(plan).map(({ text, count, length, note }) => ({
      text,
      count,
      ...(length && { length }),
      ...(note && { note }),
    })),
    groups: plan.groups.map((g) => ({
      material: g.material,
      thickness: g.thickness,
      count: groupCount(g),
      wastePercent: Math.round(g.waste * 100),
      defaultStock: g.isDefault,
      tooBig: g.tooBig.map(({ name, length, width }) => ({ name, length, width })),
      stocks: g.stocks
        .filter((l) => l.boards.length)
        .map((l) => ({
          dims: stockDims(l),
          boards: l.boards.map((b) =>
            b.map(({ name, length, width, x, y, rotated }) => ({ name, length, width, x, y, rotated })),
          ),
        })),
    })),
  }
}

export function cutPlanText(doc: ModelDocument): string {
  const plan = cutPlanJson(doc)
  if (plan.buy.length === 0) return 'Inget att kapa.'
  const lines = [`Att köpa (sågblad ${formatMm(plan.kerf)} mm, kapmån ${formatMm(plan.lengthAllowance)} mm):`]
  for (const b of plan.buy) lines.push(`  ${b.text}${b.length ? ` (${b.length})` : ''}${b.note ? ` – ${b.note}` : ''}`)
  for (const g of plan.groups) {
    lines.push(
      '',
      `${materialTitle(g.material)} ${formatMm(g.thickness)} mm: ${g.count}, spill ${g.wastePercent} %${g.defaultStock ? ' (standardmått)' : ''}`,
    )
    for (const t of g.tooBig)
      lines.push(`  För stor för lagermåtten: ${t.name} ${formatMm(t.length)} × ${formatMm(t.width)}`)
    for (const l of g.stocks)
      l.boards.forEach((b, i) =>
        lines.push(
          `  ${l.dims} nr ${i + 1}: ${b.map((p) => `${p.name} ${formatMm(p.length)} × ${formatMm(p.width)}`).join(', ')}`,
        ),
      )
  }
  return lines.join('\n')
}
