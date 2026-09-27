import { buildCutList, type CutListRow } from './cutlist'
import { toWorld } from './frame'
import { numberFormat } from './numberFormat'
import { cutAxes } from './partAxes'
import type { Axis, Body } from './types'

/**
 * Detaljblad: en del ritad i tre vyer med mått, på ett liggande A4 (287 × 200 mm,
 * mitt på sidan i PDF:en). Allt här är i millimeter på papperet, med y nedåt som i SVG.
 */

/** Riktning i delens egna mått: 0 = L (längs fibern), 1 = B, 2 = T. */
export type Dir = 0 | 1 | 2
export type Triple = [number, number, number]

export interface Span {
  lo: Triple
  hi: Triple
}

/** Något som läggs till (en tapp) eller skärs ut (ett tapphål), som en låda. round = cylinderns axel. */
export interface Feature extends Span {
  op: 'add' | 'subtract'
  round?: Dir
}

/** Delen i L, B och T, räknat från ämnets hörn: ämnets storlek, formens låda och verktygen. */
export interface PartGeometry {
  size: Triple
  form: Span & { round?: Dir }
  features: Feature[]
}

const FORM_INDEX: Record<Axis, number> = { u: 0, v: 1, n: 2 }
const round01 = (n: number) => Math.round(n * 10) / 10 + 0
/** Mindre skillnad än så här (mm) räknas som samma läge. */
const EPS = 0.05

/**
 * Delens form och verktyg i L, B och T. Ett verktyg räknas som lådan runt det
 * i formens koordinater; för ett snett vridet verktyg blir den större än verktyget.
 */
export function partGeometry(b: Body): PartGeometry {
  const blank = b.blank ?? b
  // L och B som i kaplistan: utan fiber är L det längsta måttet.
  const cut = cutAxes({ ...blank, grainAxis: b.grainAxis, thicknessAxis: b.thicknessAxis, material: b.material })
  const axes: Axis[] = [cut.length, cut.width, b.thicknessAxis]
  const origin = [blank.profile.x0, blank.profile.y0, blank.z0]
  const toLBT = (p: readonly number[]) => axes.map((a) => round01(p[FORM_INDEX[a]]! - origin[FORM_INDEX[a]]!)) as Triple
  // Vilken av L, B och T en axel i formen (0 = u, 1 = v, 2 = n) är.
  const dirOf = (formIndex: number) => axes.findIndex((a) => FORM_INDEX[a] === formIndex) as Dir

  const features = (b.tools ?? []).map((t): Feature => {
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    for (const x of [t.profile.x0, t.profile.x1]) {
      for (const y of [t.profile.y0, t.profile.y1]) {
        for (const z of [t.z0, t.z1]) {
          toWorld(t.frame, [x, y, z]).forEach((c, k) => {
            lo[k] = Math.min(lo[k]!, c)
            hi[k] = Math.max(hi[k]!, c)
          })
        }
      }
    }
    const n = t.frame.n.map(Math.abs)
    const axis = n.indexOf(Math.max(...n))
    return { op: t.op, lo: toLBT(lo), hi: toLBT(hi), ...(t.shape === 'circle' && { round: dirOf(axis) }) }
  })

  return {
    size: toLBT([blank.profile.x1, blank.profile.y1, blank.z1]),
    form: {
      lo: toLBT([b.profile.x0, b.profile.y0, b.z0]),
      hi: toLBT([b.profile.x1, b.profile.y1, b.z1]),
      ...(b.shape === 'circle' && { round: dirOf(2) }),
    },
    features,
  }
}

/** Samma form ger samma nyckel, oavsett i vilken ordning verktygen ligger. */
const geometryKey = (g: PartGeometry) =>
  JSON.stringify([g.size, g.form, g.features.map((f) => JSON.stringify(f)).sort()])

/** Vrider ett halvt varv runt en riktning: de två andra vänds. */
function halfTurn(g: PartGeometry, axis: Dir): PartGeometry {
  const flip = ([0, 1, 2] as Dir[]).filter((k) => k !== axis)
  const turn = <S extends Span>(s: S): S => {
    const lo = [...s.lo] as Triple
    const hi = [...s.hi] as Triple
    for (const k of flip) {
      lo[k] = round01(g.size[k] - s.hi[k])
      hi[k] = round01(g.size[k] - s.lo[k])
    }
    return { ...s, lo, hi }
  }
  return { size: g.size, form: turn(g.form), features: g.features.map(turn) }
}

/** Vrider ett kvarts varv runt L (bara för kvadratiskt tvärsnitt, B = T): B blir T och T blir B vänd. */
function quarterTurn(g: PartGeometry): PartGeometry {
  const B = g.size[1]
  const swap = (d: Dir | undefined): Dir | undefined => (d === 1 ? 2 : d === 2 ? 1 : d)
  const turn = <S extends Span & { round?: Dir }>(s: S): S => {
    const round = swap(s.round)
    return {
      ...s,
      lo: [s.lo[0], s.lo[2], round01(B - s.hi[1])],
      hi: [s.hi[0], s.hi[2], round01(B - s.lo[1])],
      ...(round !== undefined && { round }),
    }
  }
  return { size: g.size, form: turn(g.form), features: g.features.map(turn) }
}

/**
 * Delen vriden till ett bestämt läge bland alla vridningar som passar dess låda,
 * så att två delar som är likadana fast de sitter vridna får samma geometri.
 * Ben med tapphål på olika sidor i modellen är ofta samma ben. En spegelvänd
 * del (vänster och höger) är inte samma del och förblir olik.
 */
export function canonicalGeometry(g: PartGeometry): PartGeometry {
  const moves = [(x: PartGeometry) => halfTurn(x, 0), (x: PartGeometry) => halfTurn(x, 1)]
  if (Math.abs(g.size[1] - g.size[2]) < EPS) moves.push(quarterTurn)
  const seen = new Map([[geometryKey(g), g]])
  const queue = [g]
  while (queue.length > 0) {
    const next = queue.pop()!
    for (const move of moves) {
      const turned = move(next)
      const key = geometryKey(turned)
      if (!seen.has(key)) {
        seen.set(key, turned)
        queue.push(turned)
      }
    }
  }
  return seen.get([...seen.keys()].sort()[0]!)!
}

/**
 * Ritningens positioner: kaplistans rader, men delar med samma ämne och olika
 * hål eller tappar blir egna positioner (vridna likadana delar räknas som lika). På en ritning är en position en
 * likadan del; i kaplistan räcker det att ämnet är lika.
 */
export function drawingPositions(bodies: readonly Body[]): CutListRow[] {
  const byId = new Map(bodies.map((b) => [b.id, b]))
  return buildCutList(bodies).rows.flatMap((row) => {
    const groups = new Map<string, string[]>()
    for (const id of row.bodyIds) {
      const key = geometryKey(canonicalGeometry(partGeometry(byId.get(id)!)))
      groups.set(key, [...(groups.get(key) ?? []), id])
    }
    if (groups.size === 1) return [row]
    return [...groups.values()].map((ids, i) => ({
      ...row,
      key: `${row.key}|${i}`,
      count: ids.length,
      names: [...new Set(ids.map((id) => byId.get(id)!.name))],
      bodyIds: ids,
      volumeM3: (row.volumeM3 * ids.length) / row.count,
    }))
  })
}

/**
 * Bladet och ytan för vyerna: ovanför titelrutan, innanför ramen. Står i verklig storlek
 * mitt på en liggande A4 i PDF:en (drawingPdf.tsx), så att skalan stämmer på papperet:
 * 5 mm från papperets kant, och ramen 5 mm in, alltså 10 mm från kanten som på en
 * vanlig ritning. Skrivare brukar inte nå närmare kanten än 4–5 mm.
 */
export const SHEET = { width: 287, height: 200, frame: 5, title: { width: 125, height: 30 } } as const

export const AREA = {
  x: SHEET.frame,
  y: SHEET.frame,
  w: SHEET.width - 2 * SHEET.frame,
  h: SHEET.height - 2 * SHEET.frame - SHEET.title.height,
}

/** Luft mellan vyerna, och runt dem mot ramen. */
export const GAP = 12
export const PAD = 6
/** Plats för en rad mått, och för två (kedja och totalmått). */
export const ONE_ROW = 10
const TWO_ROWS = 18
/** Smalare än så här (B på papperet, mm) och delen ritas avbruten om det går. */
const MIN_WIDTH = 20
/** Så mycket (mm på papperet) av en slät sträcka står kvar på var sida om ett avbrott. */
const BREAK_KEEP = 12
/** Standardskalor (SS-ISO 5455), störst först: 2:1, 1:1, 1:2, 1:5 … */
export const SCALES = [0.5, 1, 2, 5, 10, 20, 50]

export type LineStyle = 'visible' | 'hidden' | 'center'

export interface SheetShape {
  kind: 'rect' | 'ellipse'
  x: number
  y: number
  w: number
  h: number
  style: 'visible' | 'hidden'
}

export interface SheetLine {
  x1: number
  y1: number
  x2: number
  y2: number
  style: LineStyle
}

/**
 * Hur en ände av en måttlinje slutar: pil innanför (in), pil utanför som pekar in (out, när
 * måttet är för kort för pilar innanför) eller en punkt (dot). Punkten står där två mått i en
 * kedja möts och något av dem är kort, som ISO 129 tillåter när pilarna inte får plats.
 */
export type DimEnd = 'in' | 'out' | 'dot'

/** Ett mått: måttlinjen, hjälplinjerna och texten. ends: hur (x1, y1) och (x2, y2) slutar. */
export interface SheetDim {
  x1: number
  y1: number
  x2: number
  y2: number
  ext: [number, number, number, number][]
  text: string
  tx: number
  ty: number
  vertical: boolean
  ends: [DimEnd, DimEnd]
  /** Hänvisningsstreck från texten till måttet, när texten fått flyttas åt sidan. */
  leader?: [number, number, number, number]
}

/** Där en avbruten vy är avbruten: vid x, över vyns höjd h från y. */
export interface SheetBreak {
  x: number
  y: number
  h: number
}

export interface PartSheetLayout {
  /** Skalan som nämnare: 5 = 1:5, 0,5 = 2:1. */
  scale: number
  shapes: SheetShape[]
  lines: SheetLine[]
  dims: SheetDim[]
  breaks: SheetBreak[]
  /** Förstoringar av små hål och tappar (A, B …). */
  details: SheetDetail[]
}

export const scaleLabel = (s: number) => (s < 1 ? `${1 / s}:1` : `1:${s}`)

/**
 * En vy: h och v är riktningarna åt höger och uppåt (down: nedåt) på papperet,
 * d är riktningen man tittar längs, near den sida av delen man ser.
 */
interface View {
  h: Dir
  v: Dir
  d: Dir
  near: 'lo' | 'hi'
  down: boolean
  x: number
  y: number
}

const fmt = numberFormat(1)

/**
 * Tre vyer enligt E-metoden (europeisk projektion, som i svensk standard):
 * huvudvyn uppifrån bredsidan (L åt höger, B uppåt), under den delen sedd
 * ovanifrån (T nedåt) och till höger sedd från vänstra änden (T åt höger).
 * Skalan är den största standardskalan där vyerna och måtten ryms.
 * Mått: L över huvudvyn, B till vänster om den, T till vänster om vyn under.
 * En lång, smal del ritas avbruten (breakFor); måtten visar ändå hela längden.
 * Finns hål eller tappar står en måttkedja närmast och totalmåttet utanför.
 */
export function layoutPartSheet(part: PartGeometry): PartSheetLayout {
  const g = featureSideUp(part)
  const [L, B, T] = g.size
  const points = ([0, 1, 2] as Dir[]).map((d) => breakpoints(g, d))
  const chain = points.map((p) => p.length > 2)
  const top = chain[0] ? TWO_ROWS : ONE_ROW
  const left = chain[1] || chain[2] ? TWO_ROWS : ONE_ROW

  // Utan avbrott: den största skalan där allt ryms. Blir delen smal på papperet
  // (ett ben) kortas den släta mitten av i stället, så att den kan ritas större.
  const room = { w: AREA.w - 2 * PAD - left - GAP, h: AREA.h - 2 * PAD - top - GAP }
  const plain = SCALES.find((sc) => L / sc + T / sc <= room.w && B / sc + T / sc <= room.h) ?? SCALES.at(-1)!
  const cut = B / plain < MIN_WIDTH ? breakFor(points[0]!, g.size, room, plain) : null
  const s = cut?.scale ?? plain
  const removed = cut ? cut.to - cut.from : 0
  // Läget längs L på papperet, med avbrottet borttaget.
  const alongL = (l: number) => (cut && l >= cut.to ? l - removed : cut && l > cut.from ? cut.from : l) / s
  const toX = (view: View, value: number) => view.x + (view.h === 0 ? alongL(value) : value / s)

  const width = left + (L - removed) / s + GAP + T / s
  const height = top + B / s + GAP + T / s
  // Med detaljer står vyerna uppe till vänster, så att den lediga ytan samlas åt höger och nedåt.
  const wanted = wantedDetails(g, s)
  const x = (wanted.length > 0 ? AREA.x + PAD : AREA.x + (AREA.w - width) / 2) + left
  const y = (wanted.length > 0 ? AREA.y + PAD : AREA.y + (AREA.h - height) / 2) + top

  const main: View = { h: 0, v: 1, d: 2, near: 'hi', down: false, x, y }
  const below: View = { h: 0, v: 2, d: 1, near: 'hi', down: true, x, y: y + B / s + GAP }
  const right: View = { h: 2, v: 1, d: 0, near: 'lo', down: false, x: x + (L - removed) / s + GAP, y }

  const shapes: SheetShape[] = []
  const lines: SheetLine[] = []
  for (const view of [main, below, right]) {
    const drawn = viewShapes(g, view, s, toX)
    shapes.push(...drawn)
    lines.push(...drawn.filter((d) => d.kind === 'ellipse').flatMap(centerLines))
  }
  const breaks: SheetBreak[] = cut
    ? [
        { x: toX(main, cut.from), y: main.y, h: B / s },
        { x: toX(below, cut.from), y: below.y, h: T / s },
      ]
    : []

  // Hidden först, så att synliga kanter ritas ovanpå.
  shapes.sort((a, b) => Number(a.style === 'visible') - Number(b.style === 'visible'))

  const viewsRight = right.x + T / s
  const slots: Rect2[] = [
    // Till höger om ändvyn, ner till titelrutan.
    { x0: viewsRight + GAP, y0: AREA.y + PAD, x1: AREA.x + AREA.w - PAD, y1: TITLE_TOP - PAD },
    // Under vyn ovanifrån, till vänster om titelrutan.
    { x0: AREA.x + PAD, y0: below.y + T / s + GAP, x1: TITLE_LEFT - PAD, y1: INNER_BOTTOM - PAD },
    // Under ändvyn, till höger om vyn ovanifrån.
    { x0: right.x, y0: main.y + B / s + GAP, x1: AREA.x + AREA.w - PAD, y1: TITLE_TOP - PAD },
  ]
  const parents = { main, below }
  const placed = placeDetails(g, wanted, s, slots, (want, value, along) => {
    const view = parents[want.view]
    if (along === 'h') return toX(view, value)
    return view.down ? view.y + value / s : view.y + g.size[view.v] / s - value / s
  })

  // Det en detalj visar längs L, B och T: där behöver kedjan på bladet inte trängas.
  const shown = ([0, 1, 2] as Dir[]).map((d) =>
    placed.flatMap(({ want }): [number, number][] => {
      if (d === 0) return [[want.lo[0], want.hi[0]]]
      return DETAIL_VIEWS[want.view].v === d ? [[want.lo[1], want.hi[1]]] : []
    }),
  )
  const atL = (a: number) => toX(main, a)
  const atB = (b: number) => main.y + B / s - b / s
  const atT = (t: number) => below.y + t / s
  const kept = [
    thinChain(points[0]!, atL, shown[0]!),
    thinChain(points[1]!, atB, shown[1]!),
    thinChain(points[2]!, atT, shown[2]!),
  ]
  const dims = [
    ...dimRows(kept[0]!, kept[0]!.length > 2, atL, main.y, 'horizontal'),
    ...dimRows(kept[1]!, kept[1]!.length > 2, atB, main.x, 'vertical'),
    ...dimRows(kept[2]!, kept[2]!.length > 2, atT, below.x, 'vertical'),
  ]
  return { scale: s, shapes, lines, dims, breaks, details: placed.map((p) => p.detail) }
}

/**
 * En kedja på bladet utan de punkter som bara trängs: är ett mått för kort för sin text
 * tas en ände bort, om den ligger inne i något en detalj visar (shown), där den har ett
 * mått i större skala. Kedjans ändar och det ingen detalj visar står kvar.
 */
export function thinChain(
  points: readonly number[],
  at: (value: number) => number,
  shown: readonly [number, number][],
) {
  const kept = [...points]
  const fits = (i: number) =>
    textWidth(fmt.format(kept[i]! - kept[i - 1]!)) + 1 <= Math.abs(at(kept[i]!) - at(kept[i - 1]!))
  const inDetail = (k: number) =>
    k > 0 && k < kept.length - 1 && shown.some(([lo, hi]) => kept[k]! > lo + EPS && kept[k]! < hi - EPS)
  for (let i = 1; i < kept.length;) {
    // Måttet från kept[i - 1] till kept[i]: ryms det inte tas den ände bort som en detalj visar.
    const drop = fits(i) ? -1 : [i, i - 1].find(inDetail)
    if (drop === undefined || drop < 0) i++
    else kept.splice(drop, 1)
  }
  return kept
}

/** Titelrutans övre vänstra hörn, och ramens nederkant. */
const TITLE_LEFT = SHEET.width - SHEET.frame - SHEET.title.width
const TITLE_TOP = SHEET.height - SHEET.frame - SHEET.title.height
const INNER_BOTTOM = SHEET.height - SHEET.frame

/** Mindre än så här (mm på papperet) och ett hål, en tapp eller avståndet till kanten får en detalj. */
const SMALL = 5
/** Skalor för detaljer, störst först: 5:1, 2:1, 1:1, 1:2, 1:5. */
const DETAIL_SCALES = [0.2, 0.5, 1, 2, 5]
/** Plats för måtten ovanför och till vänster om en detalj, och för rubriken under. */
const DETAIL_DIMS = 18
const DETAIL_LABEL = 9

interface Rect2 {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Ett område i huvudvyn eller vyn ovanifrån som behöver ritas större: lo och hi längs vyns h och v. */
export interface DetailWant {
  view: 'main' | 'below'
  lo: [number, number]
  hi: [number, number]
}

const DETAIL_VIEWS = {
  main: { h: 0, v: 1, d: 2, near: 'hi', down: false },
  below: { h: 0, v: 2, d: 1, near: 'hi', down: true },
} as const

/**
 * Var en detalj behövs: ett hål eller en tapp som blir mindre än SMALL mm på
 * papperet i huvudvyn eller vyn ovanifrån, eller står närmare än så från
 * kanten. Likadana (tappar i båda ändar) får en gemensam detalj. Området tar
 * med lite runt omkring, och hela tjockleken eller bredden om den är liten.
 */
export function wantedDetails(g: PartGeometry, s: number): DetailWant[] {
  const out: DetailWant[] = []
  const seen = new Set<string>()
  for (const f of g.features) {
    for (const view of ['main', 'below'] as const) {
      const { h, v } = DETAIL_VIEWS[view]
      const lo = [0, 1, 2].map((k) => Math.max(0, f.lo[k]!)) as Triple
      const hi = [0, 1, 2].map((k) => Math.min(g.size[k]!, f.hi[k]!)) as Triple
      // Ett mått som går genom hela delen (ett genomgående hål i en tunn skiva) syns redan i totalmåttet.
      const through = (k: Dir) => lo[k] <= g.form.lo[k] + EPS && hi[k] >= g.form.hi[k] - EPS
      const eh = through(h) ? Infinity : (hi[h] - lo[h]) / s
      const ev = through(v) ? Infinity : (hi[v] - lo[v]) / s
      const edges = [lo[v] - g.form.lo[v], g.form.hi[v] - hi[v]].filter((e) => e > EPS).map((e) => e / s)
      if (Math.min(eh, ev) >= SMALL && edges.every((e) => e >= SMALL)) continue
      // Samma storlek och samma avstånd från kanterna tvärs L: samma detalj (tappen i andra änden).
      const sig = JSON.stringify([view, f.op, round01(hi[h] - lo[h]), lo[v], hi[v]])
      if (seen.has(sig)) continue
      seen.add(sig)
      const pad = Math.max(10, 0.6 * Math.max(hi[h] - lo[h], hi[v] - lo[v]))
      const full = g.size[v] <= 3 * (hi[v] - lo[v]) || g.size[v] <= 60
      out.push({
        view,
        lo: [Math.max(0, lo[h] - pad), full ? 0 : Math.max(0, lo[v] - pad)],
        hi: [Math.min(g.size[h], hi[h] + pad), full ? g.size[v] : Math.min(g.size[v], hi[v] + pad)],
      })
    }
  }
  return out
}

/** En detalj: området ritat större i en ledig yta, och ringen runt området i vyn det kommer från. */
export interface SheetDetail {
  letter: string
  scale: number
  clip: { x: number; y: number; w: number; h: number }
  shapes: SheetShape[]
  lines: SheetLine[]
  dims: SheetDim[]
  label: { x: number; y: number }
  mark: { cx: number; cy: number; r: number }
}

/**
 * Ställer detaljerna i de lediga ytorna (slots), en i taget, i den största
 * detaljskalan som är större än bladets och ryms. En detalj som inte ryms
 * någonstans ritas inte. parentAt: ett läge i vyn detaljen kommer från, på papperet.
 */
function placeDetails(
  g: PartGeometry,
  wanted: readonly DetailWant[],
  s: number,
  slots: readonly Rect2[],
  parentAt: (want: DetailWant, value: number, along: 'h' | 'v') => number,
): { want: DetailWant; detail: SheetDetail }[] {
  const used: Rect2[] = []
  const out: { want: DetailWant; detail: SheetDetail }[] = []
  for (const want of wanted) {
    const size = { w: want.hi[0] - want.lo[0], h: want.hi[1] - want.lo[1] }
    const place = DETAIL_SCALES.filter((sd) => sd < s)
      .flatMap((sd) => slots.map((slot) => ({ sd, slot })))
      .map(({ sd, slot }) => ({
        sd,
        rect: {
          x0: slot.x0,
          y0: slot.y0,
          x1: slot.x0 + DETAIL_DIMS + size.w / sd + PAD,
          y1: slot.y0 + DETAIL_DIMS + size.h / sd + DETAIL_LABEL,
        },
        slot,
      }))
      .find(({ rect, slot }) => rect.x1 <= slot.x1 && rect.y1 <= slot.y1 && !used.some((u) => overlaps(u, rect)))
    if (!place) continue
    used.push(place.rect)
    out.push({
      want,
      detail: drawDetail(g, want, place.sd, place.rect, String.fromCharCode(65 + out.length), parentAt),
    })
  }
  return out
}

const overlaps = (a: Rect2, b: Rect2) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

function drawDetail(
  g: PartGeometry,
  want: DetailWant,
  sd: number,
  rect: Rect2,
  letter: string,
  parentAt: (want: DetailWant, value: number, along: 'h' | 'v') => number,
): SheetDetail {
  const def = DETAIL_VIEWS[want.view]
  const ox = rect.x0 + DETAIL_DIMS
  const oy = rect.y0 + DETAIL_DIMS
  const w = (want.hi[0] - want.lo[0]) / sd
  const h = (want.hi[1] - want.lo[1]) / sd
  // Vyns origo så att områdets hörn hamnar i (ox, oy).
  const view: View = {
    ...def,
    x: ox - want.lo[0] / sd,
    y: def.down ? oy - want.lo[1] / sd : oy - (g.size[def.v] - want.hi[1]) / sd,
  }
  const shapes = viewShapes(g, view, sd, (vw, value) => vw.x + value / sd)
  shapes.sort((a, b) => Number(a.style === 'visible') - Number(b.style === 'visible'))

  const inside = (d: Dir, lo: number, hi: number) => breakpoints(g, d).filter((p) => p >= lo - EPS && p <= hi + EPS)
  const hPoints = inside(def.h, want.lo[0], want.hi[0])
  const vPoints = inside(def.v, want.lo[1], want.hi[1])
  const whole = (d: Dir, pts: number[]) => pts[0] === 0 && pts.at(-1) === g.size[d]
  const vAt = (value: number) => (def.down ? view.y + value / sd : view.y + g.size[def.v] / sd - value / sd)
  const dims = [
    ...(hPoints.length >= 2
      ? dimRows(hPoints, true, (value) => view.x + value / sd, oy, 'horizontal', whole(def.h, hPoints))
      : []),
    ...(vPoints.length >= 2 ? dimRows(vPoints, true, vAt, ox, 'vertical', whole(def.v, vPoints)) : []),
  ]

  // Ringen i vyn detaljen kommer från.
  const x0 = parentAt(want, want.lo[0], 'h')
  const x1 = parentAt(want, want.hi[0], 'h')
  const y0 = parentAt(want, want.lo[1], 'v')
  const y1 = parentAt(want, want.hi[1], 'v')
  return {
    letter,
    scale: sd,
    clip: { x: ox, y: oy, w, h },
    shapes,
    lines: shapes.filter((sh) => sh.kind === 'ellipse').flatMap(centerLines),
    dims,
    label: { x: ox, y: oy + h + 6 },
    // Lite större än områdets längsta sida: en ring runt diagonalen skulle nå in över måtten.
    mark: { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: (Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2) * 1.1 },
  }
}

/**
 * Avbrott längs L: den största skalan där delen ryms om en bit av den längsta
 * släta sträckan (utan hål eller tappar) tas bort. Det som tas bort ligger mitt
 * i sträckan, med minst BREAK_KEEP mm kvar på papperet på var sida. Null om
 * ingen skala blir större än plain, den utan avbrott.
 */
export function breakFor(
  points: readonly number[],
  [L, B, T]: Triple,
  room: { w: number; h: number },
  plain: number,
): { scale: number; from: number; to: number } | null {
  let gap = { from: 0, to: 0 }
  for (let i = 1; i < points.length; i++) {
    if (points[i]! - points[i - 1]! > gap.to - gap.from) gap = { from: points[i - 1]!, to: points[i]! }
  }
  for (const scale of SCALES.filter((sc) => sc < plain && (B + T) / sc <= room.h)) {
    const need = L - (room.w - T / scale) * scale
    const keep = BREAK_KEEP * scale
    if (need <= 0 || need > gap.to - gap.from - 2 * keep) continue
    const mid = (gap.from + gap.to) / 2
    return { scale, from: mid - need / 2, to: mid + need / 2 }
  }
  return null
}

/**
 * Huvudvyn ser delen från T-sidan med störst T. Når fler hål och tappar den
 * andra sidan (en knopp på baksidan av ritningen) vänds delen ett halvt varv
 * runt L, så att huvudvyn visar dem. En vridning, ingen spegling: måtten gäller.
 */
export function featureSideUp(g: PartGeometry): PartGeometry {
  const T = 2
  const low = g.features.filter((f) => f.lo[T] <= g.form.lo[T] + EPS).length
  const high = g.features.filter((f) => f.hi[T] >= g.form.hi[T] - EPS).length
  if (low <= high) return g
  const [, B, Tsize] = g.size
  const turn = <S extends Span>(s: S): S => ({
    ...s,
    lo: [s.lo[0], B - s.hi[1], Tsize - s.hi[2]],
    hi: [s.hi[0], B - s.lo[1], Tsize - s.lo[2]],
  })
  return { size: g.size, form: turn(g.form), features: g.features.map(turn) }
}

/** Där något börjar eller slutar längs d: ämnets ändar, formens (tappens ansats) och verktygens. */
export function breakpoints(g: PartGeometry, d: Dir): number[] {
  const clamp = (n: number) => Math.min(g.size[d], Math.max(0, n))
  const values = [
    0,
    g.size[d],
    g.form.lo[d],
    g.form.hi[d],
    ...g.features.flatMap((f) => {
      // Ett hål räknas bara så långt det går i formen.
      const lo = f.op === 'subtract' ? Math.max(f.lo[d], g.form.lo[d]) : f.lo[d]
      const hi = f.op === 'subtract' ? Math.min(f.hi[d], g.form.hi[d]) : f.hi[d]
      return [clamp(lo), clamp(hi)]
    }),
  ].sort((a, b) => a - b)
  return values.filter((v, i) => i === 0 || v - values[i - 1]! > EPS)
}

/** Formen och verktygen i en vy. Ett verktyg som når sidan man ser, eller sticker ut, är synligt; annars dolt (streckat). */
function viewShapes(g: PartGeometry, view: View, s: number, toX: (view: View, value: number) => number): SheetShape[] {
  const { h, v, d } = view
  const height = g.size[v] / s
  const place = (lo: Triple, hi: Triple, kind: SheetShape['kind'], style: SheetShape['style']): SheetShape => ({
    kind,
    style,
    x: toX(view, lo[h]),
    y: view.down ? view.y + lo[v] / s : view.y + height - hi[v] / s,
    w: toX(view, hi[h]) - toX(view, lo[h]),
    h: (hi[v] - lo[v]) / s,
  })

  const out = [place(g.form.lo, g.form.hi, g.form.round === d ? 'ellipse' : 'rect', 'visible')]
  for (const f of g.features) {
    const lo = [...f.lo] as Triple
    const hi = [...f.hi] as Triple
    if (f.op === 'subtract') {
      for (const k of [h, v]) {
        lo[k] = Math.max(lo[k], g.form.lo[k])
        hi[k] = Math.min(hi[k], g.form.hi[k])
      }
      if (hi[h] - lo[h] < EPS || hi[v] - lo[v] < EPS) continue
    }
    const reachesNear = view.near === 'hi' ? f.hi[d] >= g.form.hi[d] - EPS : f.lo[d] <= g.form.lo[d] + EPS
    const outside = f.op === 'add' && [h, v].some((k) => f.lo[k] < g.form.lo[k] - EPS || f.hi[k] > g.form.hi[k] + EPS)
    out.push(place(lo, hi, f.round === d ? 'ellipse' : 'rect', reachesNear || outside ? 'visible' : 'hidden'))
  }
  return out
}

/** Centrumlinjer i kors genom ett runt hål, lite utanför det. */
function centerLines(e: SheetShape): SheetLine[] {
  const cx = e.x + e.w / 2
  const cy = e.y + e.h / 2
  const over = 2
  return [
    { x1: e.x - over, y1: cy, x2: e.x + e.w + over, y2: cy, style: 'center' },
    { x1: cx, y1: e.y - over, x2: cx, y2: e.y + e.h + over, style: 'center' },
  ]
}

/** Textens bredd på papperet, ungefär, med 2,8 mm text (TEXT i PartSheet.tsx). */
const textWidth = (text: string) => text.length * 1.65
/** Så långt ut en text flyttas i en andra rad när den inte får plats i den första. */
const LIFT = 3
/** Pilarnas längd på papperet (ARROW i PartSheet.tsx) och luften runt en text längs måttlinjen. */
const ARROW = 2.5
const TEXT_GAP = 0.8

/** Så långt åt sidan en text som inte ryms får flyttas, med ett hänvisningsstreck. */
const SHIFT_MAX = 16

/**
 * Var texterna i en kedja står, så att man ser vilket mått varje text hör till. Utan
 * hänvisningsstreck står en text bara mellan sina hjälplinjer, rakt ovanför sitt mått lite
 * längre ut (LIFT), eller efter pilen i kedjans yttersta ände (på måttlinjens förlängning).
 * Går inget av det flyttas den åt sidan och får ett streck till sitt mått (leader). Texter
 * som ryms mellan sina hjälplinjer ställs först, så att de inte trängs undan.
 */
function placeTexts(
  segments: readonly { lo: number; hi: number; text: string; loEnd: DimEnd; hiEnd: DimEnd }[],
): { at: number; lift: number; leader: boolean }[] {
  const placed: { lo: number; hi: number; lift: number }[] = []
  const free = (lo: number, hi: number, lift: number) =>
    !placed.some((p) => p.lift === lift && lo < p.hi + TEXT_GAP && p.lo < hi + TEXT_GAP)
  const fits = segments.map(({ lo, hi, text }) => textWidth(text) + 1 <= hi - lo)
  const order = [...segments.keys()].sort((a, b) => Number(fits[b]) - Number(fits[a]))
  const out: { at: number; lift: number; leader: boolean }[] = []
  // Kedjans ytterändar på papperet: där kan en text stå på måttlinjens förlängning.
  const first = segments.reduce((m, s) => Math.min(m, s.lo), Infinity)
  const last = segments.reduce((m, s) => Math.max(m, s.hi), -Infinity)
  for (const i of order) {
    const { lo, hi, text, loEnd, hiEnd } = segments[i]!
    const w = textWidth(text)
    const mid = (lo + hi) / 2
    // Efter en pil som står utanför fortsätter måttlinjen en bit; texten står efter den.
    const past = (end: DimEnd) => (end === 'out' ? ARROW + 1.5 : 0) + TEXT_GAP + w / 2
    const shifted = (lift: number) =>
      Array.from({ length: Math.round(SHIFT_MAX / 0.5) }, (_, k) => (k + 1) * 0.5)
        .flatMap((d) => [mid + d, mid - d])
        .map((at) => ({ at, lift, leader: true }))
    const tries = [
      ...(fits[i] ? [{ at: mid, lift: 0, leader: false }] : []),
      { at: mid, lift: LIFT, leader: false },
      ...(Math.abs(lo - first) < EPS ? [{ at: lo - past(loEnd), lift: 0, leader: false }] : []),
      ...(Math.abs(hi - last) < EPS ? [{ at: hi + past(hiEnd), lift: 0, leader: false }] : []),
      ...shifted(LIFT),
    ]
    const pick = tries.find((t) => free(t.at - w / 2, t.at + w / 2, t.lift)) ?? { at: mid, lift: LIFT, leader: false }
    placed.push({ lo: pick.at - w / 2, hi: pick.at + w / 2, lift: pick.lift })
    out[i] = pick
  }
  return out
}

/**
 * Måtten längs en kant av en vy: kedjan närmast (om den behövs) och totalmåttet
 * utanför. at tar ett mått längs riktningen till papperet; edge är vyns kant.
 */
export function dimRows(
  points: readonly number[],
  withChain: boolean,
  at: (value: number) => number,
  edge: number,
  orientation: 'horizontal' | 'vertical',
  withTotal = true,
): SheetDim[] {
  const chainRow = points.slice(1).map((p, i): [number, number] => [points[i]!, p])
  const totalRow: [number, number][] = [[points[0]!, points.at(-1)!]]
  const rows = withChain ? (withTotal ? [chainRow, totalRow] : [chainRow]) : [totalRow]
  return rows.flatMap((segments, row) => {
    const offset = 8 + row * 8
    const line = edge - offset
    // För kort för pilar innanför: pilarna står utanför, och där kedjan fortsätter en punkt.
    const short = segments.map(([a, b]) => Math.abs(at(b) - at(a)) < 6)
    const onPaper = segments.map(([a, b], i) => {
      const p1 = at(a)
      const p2 = at(b)
      const end = (neighbour: number): DimEnd =>
        neighbour >= 0 && neighbour < segments.length && (short[i] || short[neighbour])
          ? 'dot'
          : short[i]
            ? 'out'
            : 'in'
      const ends: [DimEnd, DimEnd] = [end(i - 1), end(i + 1)]
      const flip = p1 > p2
      return {
        p1,
        p2,
        ends,
        lo: Math.min(p1, p2),
        hi: Math.max(p1, p2),
        loEnd: flip ? ends[1] : ends[0],
        hiEnd: flip ? ends[0] : ends[1],
        text: fmt.format(b - a),
      }
    })
    const texts = placeTexts(onPaper)
    return onPaper.map(({ p1, p2, lo, hi, text, ends }, i) => {
      const { at: along, lift, leader } = texts[i]!
      // Hänvisningsstrecket: från textens närmaste ände till mitten av måttlinjen.
      const w = textWidth(text)
      const mid = (lo + hi) / 2
      const near = along > mid ? along - w / 2 : along + w / 2
      const across = line - 1 - lift - 0.8
      const ext: SheetDim['ext'] =
        orientation === 'horizontal'
          ? [
              [p1, edge - 1, p1, line - 1.5],
              [p2, edge - 1, p2, line - 1.5],
            ]
          : [
              [edge - 1, p1, line - 1.5, p1],
              [edge - 1, p2, line - 1.5, p2],
            ]
      return orientation === 'horizontal'
        ? {
            x1: p1,
            y1: line,
            x2: p2,
            y2: line,
            ext,
            text,
            tx: along,
            ty: line - 1 - lift,
            vertical: false,
            ends,
            ...(leader && { leader: [near, across, mid, line] as SheetDim['leader'] }),
          }
        : {
            x1: line,
            y1: p1,
            x2: line,
            y2: p2,
            ext,
            text,
            tx: line - 1 - lift,
            ty: along,
            vertical: true,
            ends,
            ...(leader && { leader: [across, near, line, mid] as SheetDim['leader'] }),
          }
    })
  })
}
