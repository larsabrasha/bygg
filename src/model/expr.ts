/**
 * Små aritmetiska uttryck för mått: tal, parameternamn, + − * / och parenteser.
 * Decimalkomma och decimalpunkt fungerar. "mm" direkt efter ett tal ignoreras.
 */

type Token =
  | { kind: 'num'; value: number; start: number; end: number }
  | { kind: 'ident'; name: string; start: number; end: number }
  | { kind: 'op'; op: string; start: number; end: number }

export const NAME_PATTERN = /^[A-Za-zÅÄÖåäö_][A-Za-z0-9ÅÄÖåäö_]*$/

const IDENT_START = /[A-Za-zÅÄÖåäö_]/
const IDENT_PART = /[A-Za-z0-9ÅÄÖåäö_]/

function tokenize(text: string): Token[] | string {
  const tokens: Token[] = []
  let i = 0
  while (i < text.length) {
    const c = text[i]!
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (/[0-9.,]/.test(c)) {
      const m = /^(\d+([.,]\d+)?|[.,]\d+)/.exec(text.slice(i))
      if (!m) return `Ogiltigt tal vid "${text.slice(i)}"`
      tokens.push({ kind: 'num', value: Number(m[0].replace(',', '.')), start: i, end: i + m[0].length })
      i += m[0].length
      continue
    }
    if (IDENT_START.test(c)) {
      let j = i + 1
      while (j < text.length && IDENT_PART.test(text[j]!)) j++
      const name = text.slice(i, j)
      // "mm" efter ett tal är en enhet, inget namn.
      if (name === 'mm' && tokens.at(-1)?.kind === 'num') {
        i = j
        continue
      }
      tokens.push({ kind: 'ident', name, start: i, end: j })
      i = j
      continue
    }
    if ('+-*/()'.includes(c)) {
      tokens.push({ kind: 'op', op: c, start: i, end: i + 1 })
      i++
      continue
    }
    return `Okänt tecken "${c}"`
  }
  return tokens
}

export type EvalResult = { ok: true; value: number } | { ok: false; error: string }

/** Beräknar ett uttryck. lookup ger värdet för ett namn, eller undefined om det saknas. */
export function evaluate(text: string, lookup: (name: string) => number | undefined): EvalResult {
  const tokens = tokenize(text)
  if (typeof tokens === 'string') return { ok: false, error: tokens }
  if (tokens.length === 0) return { ok: false, error: 'Tomt uttryck' }

  let pos = 0
  const peekOp = () => {
    const t = tokens[pos]
    return t?.kind === 'op' ? t.op : null
  }

  // Rekursiv nedstigning. Kastar sträng vid fel.
  const expr = (): number => {
    let v = term()
    for (let op = peekOp(); op === '+' || op === '-'; op = peekOp()) {
      pos++
      const r = term()
      v = op === '+' ? v + r : v - r
    }
    return v
  }
  const term = (): number => {
    let v = factor()
    for (let op = peekOp(); op === '*' || op === '/'; op = peekOp()) {
      pos++
      const r = factor()
      if (op === '/' && r === 0) throw 'Division med noll'
      v = op === '*' ? v * r : v / r
    }
    return v
  }
  const factor = (): number => {
    const t = tokens[pos]
    if (!t) throw 'Uttrycket tar slut för tidigt'
    pos++
    if (t.kind === 'num') return t.value
    if (t.kind === 'ident') {
      const v = lookup(t.name)
      if (v === undefined) throw `Okänd parameter "${t.name}"`
      return v
    }
    if (t.op === '-') return -factor()
    if (t.op === '+') return factor()
    if (t.op === '(') {
      const v = expr()
      if (peekOp() !== ')') throw 'Saknar )'
      pos++
      return v
    }
    throw `Oväntat "${t.op}"`
  }

  try {
    const value = expr()
    if (pos < tokens.length) return { ok: false, error: 'Oväntat slut på uttrycket' }
    if (!Number.isFinite(value)) return { ok: false, error: 'Ogiltigt resultat' }
    return { ok: true, value }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** Namnen som ett uttryck refererar till. */
export function identifiers(text: string): string[] {
  const tokens = tokenize(text)
  if (typeof tokens === 'string') return []
  return [...new Set(tokens.flatMap((t) => (t.kind === 'ident' ? [t.name] : [])))]
}

/** Byter namn på en parameter i ett uttryck, utan att röra andra namn som innehåller samma text. */
export function renameIdentifier(text: string, from: string, to: string): string {
  const tokens = tokenize(text)
  if (typeof tokens === 'string') return text
  let out = text
  for (const t of [...tokens].reverse()) {
    if (t.kind === 'ident' && t.name === from) out = out.slice(0, t.start) + to + out.slice(t.end)
  }
  return out
}

/** Sant om uttrycket inte refererar till några parametrar (bara tal). */
export function isConstant(text: string): boolean {
  return identifiers(text).length === 0
}
