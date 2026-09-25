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

/**
 * Läget för en etikett som inte täcker de som redan står eller pilen. Först
 * provas lägen en bit åt sidan längs kanten, sedan längre ut från den; så
 * sitter etiketten kvar vid sin kant. Går inget fritt läge att hitta blir det
 * läget längst ut.
 */
export function placeLabel(p: Placement, size: Px, placed: readonly LabelBox[], arrow: Segment | null): Px {
  const side: Px = [-p.n[1], p.n[0]]
  const free = (pos: Px) => {
    const box = { pos, size }
    return !placed.some((q) => overlapsBox(box, q)) && !(arrow && overlapsSegment(box, arrow))
  }
  let last: Px = p.m
  for (let out = 0; out <= MAX_OUT; out++) {
    const d = p.d + out * STEP
    for (let s = 0; s <= MAX_SIDE; s++) {
      for (const sign of s === 0 ? [1] : [1, -1]) {
        const t = sign * s * STEP
        const pos: Px = [p.m[0] + p.n[0] * d + side[0] * t, p.m[1] + p.n[1] * d + side[1] * t]
        if (free(pos)) return pos
        if (s === 0) last = pos
      }
      // Krockar den bara med andra etiketter flyttas den ut, som förut; åt sidan hamnar den vid fel kant.
      if (!arrow) break
    }
  }
  return last
}
