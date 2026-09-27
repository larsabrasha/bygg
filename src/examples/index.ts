import bokhylla from './bokhylla.json'
import bokhyllaBild from './bokhylla.webp'
import bord from './bord.json'
import bordBild from './bord.webp'
import nattduksbord from './nattduksbord.json'
import skarbrada from './skarbrada.json'
import skarbradaBild from './skarbrada.webp'
import stol from './stol.json'
import stolBild from './stol.webp'

/**
 * Exempelmodeller, gjorda i appen och sparade i sparformatet. Utan konto
 * (gästläget) får man EXAMPLES att prova på, märkta som exempel; bordet och
 * stolen är tagna ur en matgrupp. Startsidan visar bordet och nattduksbordet.
 * thumb: bilden i startvyn, tagen i appen.
 */
export interface Example {
  name: string
  file: unknown
  thumb: string
}

export const EXAMPLES: readonly Example[] = [
  { name: 'Bord', file: bord, thumb: bordBild },
  { name: 'Stol', file: stol, thumb: stolBild },
  { name: 'Bokhylla', file: bokhylla, thumb: bokhyllaBild },
  { name: 'Skärbräda', file: skarbrada, thumb: skarbradaBild },
]

/** Den som öppnas under startvyn första gången: går fort att rita. */
export const FIRST_OPEN = 'Stol'

export { bord, nattduksbord }
