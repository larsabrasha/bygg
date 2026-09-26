/** Namn som synken ger en konfliktkopia: "Namn (konflikt 2026-09-25 03:34)" (se sync/engine.ts). */
const CONFLICT = /^(.*) \(konflikt ([^)]+)\)$/

/** Delar upp ett konfliktnamn i det ursprungliga namnet och när krocken skedde. Null för vanliga namn. */
export function splitConflict(name: string): { base: string; when: string } | null {
  const m = CONFLICT.exec(name)
  return m ? { base: m[1]!, when: m[2]! } : null
}
