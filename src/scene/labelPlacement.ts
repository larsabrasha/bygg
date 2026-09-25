/**
 * Var en måttetikett hamnar på skärmen när något redan står där: andra
 * etiketter och pilen för push/pull. Ren logik i px, så att den går att testa.
 */

export type Px = [number, number]

/** En etikett: mitt och storlek. */
export interface LabelBox {
  pos: Px
  size: Px
}

/** Pilen på skärmen: en sträcka från a till b, och hur tjock den är räknat från mitten. */
export interface Segment {
  a: Px
  b: Px
  r: number
}

/** Etikettens första läge: kantens mitt m, riktningen ut n (längd 1) och avståndet d. */
export interface Placement {
  m: Px
  n: Px
  d: number
}

/** Luft mellan etiketter, i px. */
const PAD = 4
/** Hur långt en etikett flyttas i taget, och som mest hur många gånger ut från kanten. */
const STEP = 8
const MAX_OUT = 12
/** Hur långt åt sidan (längs kanten) den provas innan den flyttas längre ut, i steg. */
const MAX_SIDE = 6

function overlapsBox(a: LabelBox, b: LabelBox): boolean {
  return (
    Math.abs(a.pos[0] - b.pos[0]) * 2 < a.size[0] + b.size[0] + PAD &&
    Math.abs(a.pos[1] - b.pos[1]) * 2 < a.size[1] + b.size[1] + PAD
  )
}

/** Avståndet från en punkt till en rektangel (0 inuti). */
function pointToBox([x, y]: Px, { pos, size }: LabelBox): number {
  const dx = Math.max(Math.abs(x - pos[0]) - size[0] / 2, 0)
  const dy = Math.max(Math.abs(y - pos[1]) - size[1] / 2, 0)
  return Math.hypot(dx, dy)
}

/** Om sträckan (med sin tjocklek) går genom etiketten. Provas i punkter längs den; pilen är kort. */
export function overlapsSegment(box: LabelBox, { a, b, r }: Segment): boolean {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    if (pointToBox([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], box) <= r + PAD / 2) return true
  }
  return false
}

/** Det en etikett ska hålla sig undan från. */
export interface Obstacles {
  /** Etiketter som redan står. */
  placed: readonly LabelBox[]
  /** Pilen för push/pull, om den syns. */
  arrow: Segment | null
  /** Knappar och rutor ovanpå vyn (raden för det valda, kameraknapparna, måttrutan). */
  covers: readonly LabelBox[]
  /** Vyns storlek; etiketten hålls inom den, margin px från kanten. */
  view: Px
  margin: number
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), Math.max(lo, hi))

/**
 * Läget för en etikett som inte täcker det som redan står, pilen eller
 * knapparna ovanpå vyn, och som ligger inom vyn. Först provas lägen en bit åt
 * sidan längs kanten, sedan längre ut från den; så sitter etiketten kvar vid
 * sin kant. Krockar den bara med andra etiketter flyttas den bara ut, som
 * förut. Finns ingen plats vid kanten ställs den precis utanför knappen som
 * är i vägen, och annars i läget längst ut.
 */
export function placeLabel(p: Placement, size: Px, o: Obstacles): Px {
  const side: Px = [-p.n[1], p.n[0]]
  const inView = ([x, y]: Px): Px => [
    clamp(x, size[0] / 2 + o.margin, o.view[0] - size[0] / 2 - o.margin),
    clamp(y, size[1] / 2 + o.margin, o.view[1] - size[1] / 2 - o.margin),
  ]
  const hard = (box: LabelBox) =>
    o.covers.some((q) => overlapsBox(box, q)) || (!!o.arrow && overlapsSegment(box, o.arrow))
  const free = (pos: Px) => {
    const box = { pos, size }
    return !o.placed.some((q) => overlapsBox(box, q)) && !hard(box)
  }
  let last: Px = inView(p.m)
  for (let out = 0; out <= MAX_OUT; out++) {
    const d = p.d + out * STEP
    const at = (t: number): Px => inView([p.m[0] + p.n[0] * d + side[0] * t, p.m[1] + p.n[1] * d + side[1] * t])
    last = at(0)
    if (free(last)) return last
    // Åt sidan bara om pilen eller en knapp är i vägen; krockar den bara med en etikett flyttas den ut.
    if (!hard({ pos: last, size })) continue
    for (let s = 1; s <= MAX_SIDE; s++)
      for (const sign of [1, -1]) {
        const pos = at(sign * s * STEP)
        if (free(pos)) return pos
      }
  }
  // Ingen plats vid kanten (en bred knapprad, och vyn tar slut): precis utanför knappen, där det är närmast.
  const start = inView([p.m[0] + p.n[0] * p.d, p.m[1] + p.n[1] * p.d])
  const around = o.covers
    .filter((q) => overlapsBox({ pos: start, size }, q))
    .flatMap((q): Px[] => {
      const dx = (q.size[0] + size[0] + PAD) / 2 + 1
      const dy = (q.size[1] + size[1] + PAD) / 2 + 1
      return [
        [start[0], q.pos[1] + dy],
        [start[0], q.pos[1] - dy],
        [q.pos[0] + dx, start[1]],
        [q.pos[0] - dx, start[1]],
      ]
    })
    .map(inView)
    .filter(free)
    .sort((a, b) => Math.hypot(a[0] - start[0], a[1] - start[1]) - Math.hypot(b[0] - start[0], b[1] - start[1]))
  return around[0] ?? last
}
