/**
 * Talformat för allt som visas: svensk decimalkomma, högst digits decimaler.
 * signDisplay 'negative' visar aldrig "-0", inte heller för små negativa tal
 * som avrundas till noll (−0,04 med en decimal blir "0").
 */
export function numberFormat(digits: number, grouping = false): Intl.NumberFormat {
  return new Intl.NumberFormat('sv-SE', {
    maximumFractionDigits: digits,
    useGrouping: grouping,
    signDisplay: 'negative',
  })
}
