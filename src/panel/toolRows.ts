import { numberFormat } from '../model/numberFormat'
import { extent, widthAxis } from '../model/partAxes'
import type { Body, Combine } from '../model/types'

const fmt = numberFormat(1)

/** Vad ett verktyg är sett från en del: tappen sitter på värden, tapphålet i delen den går in i. */
export type Kind = 'tapp' | 'tapphål' | 'urtag' | 'tillägg'

export const KIND_TITLES: Record<Kind, { one: string; many: string }> = {
  tapp: { one: 'Tapp', many: 'tappar' },
  tapphål: { one: 'Tapphål', many: 'tapphål' },
  urtag: { one: 'Urtag', many: 'urtag' },
  tillägg: { one: 'Tillägg', many: 'tillägg' },
}

export function kindOf(tool: Combine, partId: string): Kind {
  if (tool.op === 'joint') return tool.into === partId ? 'tapphål' : 'tapp'
  return tool.op === 'subtract' ? 'urtag' : 'tillägg'
}

/** Namn som appen gav (Tapp 3, Del 12) säger inget; ett eget namn visas. */
const autoName = (name: string) => /^(Del|Tapp|Urtag|Tillägg) \d+$/.test(name)

/** L × B × T, i samma ordning som fälten under Mått. */
export function sizeText(b: Body): string {
  const f = (a: Body['grainAxis']) => fmt.format(extent(b, a))
  return b.shape === 'circle'
    ? `Ø ${f('u')} × ${f('n')}`
    : [b.grainAxis, widthAxis(b), b.thicknessAxis].map(f).join(' × ')
}

export interface ToolRow {
  /** Verktygen raden står för; ett tryck väljer det första. */
  ids: string[]
  kind: Kind
  title: string
  detail: string
}

/**
 * Raderna under Urtag och tillägg för delen partId: dess verktyg och tapphålen från andra
 * delars tappar. Tappar i samma grupp (Combine.group) är en rad, med antalet: fyra tappar
 * från fyra länkade ben in i en skiva blir "4 tapphål". Allt annat får en rad var.
 */
export function toolRows(bodies: readonly Body[], partId: string): ToolRow[] {
  const nameOf = (id: string | undefined) => bodies.find((b) => b.id === id)?.name ?? ''
  const groups = new Map<string, { t: Body; kind: Kind; ids: string[] }>()
  for (const t of bodies) {
    if (t.tool?.host !== partId && t.tool?.into !== partId) continue
    const key = (t.tool.op === 'joint' && t.tool.group) || t.id
    const g = groups.get(key)
    if (g) g.ids.push(t.id)
    else groups.set(key, { t, kind: kindOf(t.tool, partId), ids: [t.id] })
  }
  return [...groups.values()].map(({ t, kind, ids }) => {
    const n = ids.length
    const many = n > 1
    const relation =
      kind === 'tapp'
        ? `in i ${nameOf(t.tool!.into)}`
        : kind === 'tapphål'
          ? `för ${many ? 'tapparna' : 'tappen'} på ${nameOf(t.tool!.host)}`
          : ''
    const own = !autoName(t.name)
    const kindTitle = many ? `${n} ${KIND_TITLES[kind].many}` : KIND_TITLES[kind].one
    const title = own ? (many ? `${n} × ${t.name}` : t.name) : kindTitle
    const detail = [own ? `${KIND_TITLES[kind].one} ${relation}`.trim() : relation, sizeText(t)]
      .filter(Boolean)
      .join(' · ')
    return { ids, kind, title, detail }
  })
}
