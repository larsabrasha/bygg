/** Så många modeller behövs innan startvyn visar sökfältet; med färre ser man dem alla ändå. */
export const SEARCH_FROM = 9

const words = (text: string) => text.toLocaleLowerCase('sv').split(/\s+/).filter(Boolean)

/**
 * Modellens namn innehåller alla ord i sökningen, var som helst och i vilken ordning som helst,
 * utan hänsyn till stora och små bokstäver. Å, ä och ö är egna bokstäver, som i svenskan.
 */
export function matchesSearch(name: string, query: string): boolean {
  const hay = name.toLocaleLowerCase('sv')
  return words(query).every((w) => hay.includes(w))
}
