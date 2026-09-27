/**
 * f(item) för varje item, med högst `ahead` på väg samtidigt, och resultaten i samma
 * ordning som items. För hämtningar från servern: en i taget kostar en hel resa fram och
 * tillbaka per anrop, vilket på mobilnät blir sekunder med många modeller.
 *
 * Som en vanlig loop i övrigt: den som går igenom resultaten behandlar dem i ordning, och
 * ett fel kommer när det misslyckade resultatet står på tur (de före är redan behandlade).
 * Hämtningar som redan startats efter ett fel körs klart men används inte.
 */
export async function* prefetched<T, R>(
  items: readonly T[],
  ahead: number,
  f: (item: T) => Promise<R>,
): AsyncGenerator<[T, R]> {
  const started: Promise<R>[] = []
  const start = (i: number) => {
    if (i >= items.length) return
    const p = f(items[i]!)
    // Felet tas om hand när resultatet väntas in; utan det här blir ett fel som kommer
    // medan en tidigare hämtning väntas in ett "unhandled rejection".
    p.catch(() => {})
    started[i] = p
  }
  for (let i = 0; i < ahead; i++) start(i)
  for (let i = 0; i < items.length; i++) {
    const result = await started[i]!
    start(i + ahead)
    yield [items[i]!, result]
  }
}
