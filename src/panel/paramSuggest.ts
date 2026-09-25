/**
 * Förslag på parameternamn medan man skriver ett uttryck, och uppdelning av
 * ett uttryck i text och parameternamn (för badges). Ren logik, testbar i node.
 */

const IDENT_START = /[A-Za-zÅÄÖåäö_]/
const IDENT_PART = /[A-Za-z0-9ÅÄÖåäö_]/

/** Ordet som markören står i eller direkt efter, som [start, end). Tomt om det inte är ett namn (t.ex. ett tal). */
export function wordAt(text: string, caret: number): { start: number; end: number; word: string } {
  let start = caret
  while (start > 0 && IDENT_PART.test(text[start - 1]!)) start--
  let end = caret
  while (end < text.length && IDENT_PART.test(text[end]!)) end++
  const word = text.slice(start, end)
  if (word && !IDENT_START.test(word[0]!)) return { start: caret, end: caret, word: '' }
  return { start, end, word }
}

/**
 * Namn att föreslå. Mitt i ett namn: de som börjar likadant (utan hänsyn till
 * stora och små bokstäver). Mellan två led, eller i ett tomt fält: alla.
 * Direkt efter en siffra eller ett avslutat led: inga, där skriver man ett tal eller en operator.
 */
export function suggestions(names: readonly string[], text: string, caret: number): string[] {
  const { word, start } = wordAt(text, caret)
  if (word) {
    const w = word.toLowerCase()
    return names.filter((n) => n.toLowerCase().startsWith(w) && n !== word)
  }
  const before = text.slice(0, start).trimEnd()
  const last = before.at(-1)
  return last === undefined || '+-−*/('.includes(last) ? [...names] : []
}

/** Sätter in ett namn i stället för ordet vid markören. Ger ny text och ny markörposition. */
export function insertName(text: string, caret: number, name: string): { text: string; caret: number } {
  const { start, end } = wordAt(text, caret)
  return { text: text.slice(0, start) + name + text.slice(end), caret: start + name.length }
}

export interface Segment {
  text: string
  /** Sant om texten är namnet på en parameter. */
  param: boolean
}

/** Delar upp ett uttryck i vanlig text och parameternamn. */
export function segments(text: string, names: ReadonlySet<string>): Segment[] {
  const out: Segment[] = []
  const push = (t: string, param: boolean) => {
    const prev = out.at(-1)
    if (prev && !prev.param && !param) prev.text += t
    else out.push({ text: t, param })
  }
  let i = 0
  while (i < text.length) {
    if (IDENT_START.test(text[i]!) && !(i > 0 && IDENT_PART.test(text[i - 1]!))) {
      let j = i + 1
      while (j < text.length && IDENT_PART.test(text[j]!)) j++
      const w = text.slice(i, j)
      push(w, names.has(w))
      i = j
    } else {
      push(text[i]!, false)
      i++
    }
  }
  return out
}
