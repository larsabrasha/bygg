import type { View } from './models'

/**
 * En nyckel för möblerna som stillbilderna visar: namn, vinkel, storlek och varje del.
 * Skriptet (npm run stills) sparar den i stills/stills.json, och stillsKey.test.ts säger
 * till när möblerna har ändrats utan att bilderna tagits om. Studioljuset och
 * trätexturerna ingår inte; ändras de får man själv komma ihåg att ta om bilderna.
 */
export function stillsKey(views: readonly View[]): string {
  return cyrb53(JSON.stringify(views.map((v) => [v.name, v.angle, v.fill, v.bodies])))
}

/** cyrb53 (public domain): en kort, snabb hash som ger samma svar i webbläsaren och i Node. */
function cyrb53(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}
