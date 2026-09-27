/**
 * Packning med giljotinsnitt: varje snitt går tvärs över hela den bit det
 * delar, så att utlägget går att såga med bordsåg eller skivsåg.
 *
 * Efter guillotine-packer av Tyler Schroeder (MIT), som bygger på Jylänkis
 * "A Thousand Ways to Pack the Bin". Skillnader: varje bit säger själv om den
 * får vridas (fibern), och vid lika många skivor vinner den som lämnar minst
 * på den sista, så att spillbiten blir så stor som möjligt.
 */

export interface PackItem<T> {
  /** Längs skivans längd (x). */
  width: number
  /** Längs skivans bredd (y). */
  height: number
  /** Får vridas 90°. */
  rotatable: boolean
  data: T
}

export interface Placed<T> {
  x: number
  y: number
  /** Måtten som biten ligger, alltså bytta om den är vriden. */
  width: number
  height: number
  rotated: boolean
  data: T
}

interface Free {
  x: number
  y: number
  width: number
  height: number
  bin: number
}

interface Size {
  width: number
  height: number
}

type Selection = (free: Free, item: Size) => number
type Split = (free: Free, item: Size) => boolean
type Sort = (a: Size, b: Size) => number

const SELECTIONS: Selection[] = [
  // Minst kvar på den korta sidan, minst kvar på den långa, minsta lediga yta.
  (f, i) => Math.min(f.width - i.width, f.height - i.height),
  (f, i) => Math.max(f.width - i.width, f.height - i.height),
  (f) => f.width * f.height,
]

/**
 * true: det genomgående snittet går längs x (skivans längd) vid bitens överkant,
 * så att biten till höger blir lika hög som biten. false: det går längs y.
 */
const SPLITS: Split[] = [
  (f, i) => f.width - i.width >= f.height - i.height,
  (f, i) => f.width - i.width < f.height - i.height,
  (f) => f.width > f.height,
  (f) => f.width < f.height,
]

const short = (s: Size) => Math.min(s.width, s.height)
const long = (s: Size) => Math.max(s.width, s.height)

const SORTS: Sort[] = [
  (a, b) => a.width * a.height - b.width * b.height,
  (a, b) => short(a) - short(b) || long(a) - long(b),
  (a, b) => long(a) - long(b) || short(a) - short(b),
  (a, b) => a.width + a.height - (b.width + b.height),
  (a, b) => Math.abs(a.width - a.height) - Math.abs(b.width - b.height),
  (a, b) => a.width / a.height - b.width / b.height,
]

const fits = (f: Size, i: Size) => f.width >= i.width && f.height >= i.height

/** Går biten in på en tom skiva, som den ligger eller vriden (om den får vridas)? */
export function fitsBin(bin: Size, item: PackItem<unknown>): boolean {
  return fits(bin, item) || (item.rotatable && fits(bin, { width: item.height, height: item.width }))
}

function splitFree(f: Free, i: Size, kerf: number, across: boolean): Free[] {
  const right = { ...f, x: f.x + i.width + kerf, width: f.width - i.width - kerf }
  const above = { ...f, y: f.y + i.height + kerf, height: f.height - i.height - kerf }
  const parts = across ? [{ ...right, height: i.height }, above] : [right, { ...above, width: i.width }]
  return parts.filter((r) => r.width > 0 && r.height > 0)
}

function packOnce<T>(
  bin: Size,
  items: readonly PackItem<T>[],
  kerf: number,
  select: Selection,
  split: Split,
): Placed<T>[][] {
  const free: Free[] = []
  const bins: Placed<T>[][] = []

  const option = (size: Size) => {
    let best: Free | undefined
    let bestValue = Infinity
    for (const f of free) {
      if (!fits(f, size)) continue
      const v = select(f, size)
      if (v < bestValue) {
        best = f
        bestValue = v
      }
    }
    if (!best) return null
    const parts = splitFree(best, size, kerf, split(best, size))
    return { free: best, parts, size }
  }

  const choose = (item: PackItem<T>) => {
    const plain = option(item)
    const turned = item.rotatable ? option({ width: item.height, height: item.width }) : null
    if (!plain || !turned) return plain ?? turned
    // Som guillotine-packer: det läge som lämnar den största lediga biten.
    const biggest = (o: NonNullable<typeof plain>) => Math.max(0, ...o.parts.map((p) => p.width * p.height))
    return biggest(plain) >= biggest(turned) ? plain : turned
  }

  for (const item of items) {
    let chosen = choose(item)
    if (!chosen) {
      free.push({ x: 0, y: 0, ...bin, bin: bins.length })
      bins.push([])
      chosen = choose(item)
    }
    if (!chosen) throw new Error('Biten går inte in på en tom skiva')
    const { free: f, parts, size } = chosen
    bins[f.bin]!.push({ x: f.x, y: f.y, ...size, rotated: size.width !== item.width, data: item.data })
    free.splice(free.indexOf(f), 1, ...parts)
  }
  return bins
}

const usedArea = (placed: readonly Placed<unknown>[]) => placed.reduce((sum, p) => sum + p.width * p.height, 0)

/**
 * Lägger ut bitarna på så få skivor som möjligt. Varje bit måste gå in på en
 * tom skiva (se fitsBin). Prövar alla kombinationer av sortering, val av
 * ledig yta och snitt, och behåller den bästa. kerf är sågbladets bredd.
 */
export function packGuillotine<T>(bin: Size, items: readonly PackItem<T>[], kerf: number): Placed<T>[][] {
  if (items.length === 0) return []
  let best: Placed<T>[][] | undefined
  for (const sort of SORTS) {
    const ascending = [...items].sort(sort)
    for (const order of [ascending, [...ascending].reverse()]) {
      for (const select of SELECTIONS) {
        for (const split of SPLITS) {
          const bins = packOnce(bin, order, kerf, select, split)
          if (
            !best ||
            bins.length < best.length ||
            (bins.length === best.length && usedArea(bins.at(-1)!) < usedArea(best.at(-1)!))
          )
            best = bins
        }
      }
    }
  }
  return best!
}
