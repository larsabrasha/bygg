/**
 * Varifrån trätexturerna kommer: foton från Poly Haven (CC0, fria att använda).
 * scripts/woodTextures.ts hämtar dem, gör dem gråa, färgar dem med
 * materialColor och sparar dem i src/assets/wood, med normalerna (porerna) bredvid. Bara mönstret kommer från
 * fotot; färgen är appens egen, så att trät ser ut som i det skuggade utseendet.
 *
 * id: tillgången på polyhaven.com. mm: hur stor bilden är i verkligheten.
 * contrast: hur starkt mönstret syns. rotate: grader medurs, så att fibern går
 * längs bildens bredd (som grainUv lägger den). flip: spegla, så att två
 * träslag med samma foto inte ser likadana ut. pores: hur djupa porerna och
 * ådringen är i ytan (lutningen i normalkartan, i snitt). color: grundfärgen
 * i texturen, om den ska skilja sig från materialColor (det skuggade utseendet).
 */
export interface WoodSource {
  id: string
  mm: number
  contrast: number
  pores: number
  rotate?: 90
  flip?: true
  color?: string
}

export const WOOD_SOURCES: Record<string, WoodSource> = {
  furu: { id: 'coated_pine', mm: 740, contrast: 0.9, pores: 0.05 },
  gran: { id: 'coated_pine', mm: 740, contrast: 0.5, pores: 0.04, flip: true },
  // Ek i realistiskt ljus blir orange med materialColor; lite gråare honung liknar oljad ek.
  ek: { id: 'white_oak_veneer', mm: 500, contrast: 1.6, pores: 0.1, rotate: 90, color: '#b39270' },
  // Poly Havens ask (ash_veneer) ser borstad ut; den ljusa eken liknar ask mer.
  ask: { id: 'silver_oak_veneer_01', mm: 1000, contrast: 1.6, pores: 0.08 },
  // Det finns ingen björk; lönn är lika ljus och har samma svaga mönster.
  björk: { id: 'white_maple_veneer', mm: 1000, contrast: 2.2, pores: 0.04 },
  // Ytfanéret på plywood: okoume är vanligt, ljust och har plywoodens breda, mjuka mönster.
  plywood: { id: 'okoume_veneer', mm: 1000, contrast: 1.8, pores: 0.04 },
}

/** Filnamnet utan å, ä och ö: björk → bjork.webp, och normalerna i bjork-normal.webp. */
export const woodFile = (material: string, kind: 'color' | 'normal' = 'color') =>
  material.normalize('NFD').replace(/[^a-z]/g, '') + (kind === 'normal' ? '-normal' : '') + '.webp'
