/**
 * Redigering med sifferblocket (Numpad): sätter in text där markören står, eller
 * byter ut det markerade, och raderar. Ren logik, så att den går att testa.
 */
export interface Edit {
  text: string
  /** Markören efteråt. */
  caret: number
}

export function insertAt(value: string, start: number, end: number, text: string): Edit {
  return { text: value.slice(0, start) + text + value.slice(end), caret: start + text.length }
}

/** Raderar det markerade, eller tecknet före markören. */
export function backspaceAt(value: string, start: number, end: number): Edit {
  if (end > start) return { text: value.slice(0, start) + value.slice(end), caret: start }
  if (start === 0) return { text: value, caret: 0 }
  return { text: value.slice(0, start - 1) + value.slice(start), caret: start - 1 }
}

/**
 * Ett namn (parameter) att sätta in: med mellanslag mot en siffra eller ett
 * annat namn intill, så att "56" och "mått1" inte blir "56mått1".
 */
export function nameAt(value: string, start: number, end: number, name: string): Edit {
  const word = /[\p{L}\p{N}_]/u
  const before = start > 0 && word.test(value[start - 1]!) ? ' ' : ''
  const after = end < value.length && word.test(value[end]!) ? ' ' : ''
  return insertAt(value, start, end, before + name + after)
}
