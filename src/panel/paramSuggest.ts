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

/** Markerad text (caret till selEnd) räknas som borttagen: ett valt namn ersätter den. */
const withoutSelection = (text: string, caret: number, selEnd: number) =>
  selEnd > caret ? text.slice(0, caret) + text.slice(selEnd) : text

/**
 * Namn att föreslå. Mitt i ett namn: de som börjar likadant (utan hänsyn till
 * stora och små bokstäver). Direkt efter en operator: alla. Annars inga: ett tomt
 * eller markerat fält ska inte fyllas av en lista varje gång man klickar i det,
 * och före eller efter ett tal skriver man ett tal eller en operator.
 */
export function suggestions(names: readonly string[], text: string, caret: number, selEnd = caret): string[] {
  const t = withoutSelection(text, caret, selEnd)
  const { word, start } = wordAt(t, caret)
  if (word) {
    const w = word.toLowerCase()
    return names.filter((n) => n.toLowerCase().startsWith(w) && n !== word)
  }
  // Ett namn här skulle klistras ihop med talet efter, t.ex. "bredd800".
  if (IDENT_PART.test(t[start] ?? '')) return []
  const last = t.slice(0, start).trimEnd().at(-1)
  return last !== undefined && '+-−*/('.includes(last) ? [...names] : []
}

/** Sätter in ett namn i stället för ordet vid markören, eller det markerade. Ger ny text och ny markörposition. */
export function insertName(text: string, caret: number, name: string, selEnd = caret): { text: string; caret: number } {
  const t = withoutSelection(text, caret, selEnd)
  const { start, end } = wordAt(t, caret)
  return { text: t.slice(0, start) + name + t.slice(end), caret: start + name.length }
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
