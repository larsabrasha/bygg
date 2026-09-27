import { materialSpec } from './materials'

/**
 * Svenska handelsmått för virke och skivor, i mm. Kapschemat föreslår lagermått
 * härifrån, och tjockleken på virket är den närmaste standardtjockleken som
 * räcker för delen (en del ritad 20 tjock tas ur 22 och hyvlas ner).
 *
 * Källor (september 2026):
 * - Längder: Träguiden, "Dimensioner": virke kapas i 1 800, 2 100 och 2 400–5 400 mm,
 *   multiplar av 300; bygghandeln lagerhåller upp till 5 400.
 * - Hyvlat virke: Optimeras sortiment av dimensionshyvlat (22, 28, 34, 45, 70, 95 tjockt) och
 *   hyvlad furu 22 × 95–220 hos flera bygghandlare.
 * - Limfog av furu och gran: Bauhaus sortiment (18 och 27 tjockt, 200–900 brett, 800–2 400 långt).
 * - Limfog av ek: Ceos och Svensk Trähandel (12, 20, 27, 30, 40 tjockt; bänkskivor 600–900 breda).
 * - Skivor (plywood, MDF m.fl.): se materials.
 * Sortimentet skiljer sig mellan butiker; det här är de vanligaste måtten.
 */

/** Hyvlat virke: tjocklekar, bredder och standardlängder. Lövträ får samma tills vidare. */
export const BOARD = {
  thicknesses: [22, 28, 34, 45, 70, 95],
  widths: [45, 70, 95, 120, 145, 170, 195, 220],
  lengths: [1800, 2100, 2400, 2700, 3000, 3300, 3600, 3900, 4200, 4500, 4800, 5100, 5400],
}

/** Limfogsskivor av massivt trä. Tjocklekarna skiljer sig mellan barrträ och lövträ (panelThicknesses). */
export const PANEL = {
  widths: [200, 300, 400, 500, 600, 800, 900],
  lengths: [800, 1200, 1800, 2000, 2400],
}

/** Limfog av furu och gran finns i 18 och 27; av ek och annat lövträ i 20, 27 och 40. */
export const panelThicknesses = (material: string) => (materialSpec(material).hardwood ? [20, 27, 40] : [18, 27])

/** Den minsta standardtjocklek som räcker för delen, eller delens egen om ingen räcker. */
export const standardThickness = (thicknesses: readonly number[], part: number) =>
  thicknesses.find((t) => t >= part - 1e-6) ?? part
