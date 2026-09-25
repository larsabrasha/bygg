/**
 * Tolkar ett mått som användaren skrivit, i mm. Tar emot decimalkomma och
 * decimalpunkt och ett valfritt "mm". Null om texten inte är ett tal.
 */
export function parseLength(text: string): number | null {
  const t = text.trim().replace(/\s*mm$/i, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$|^-?\.\d+$/.test(t)) return null
  return Number(t)
}
