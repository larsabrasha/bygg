import { buildCutList } from '../model/cutlist'
import { buildCutPlan } from '../model/cutPlan'
import { overallSize } from '../model/drawing'
import { canonicalGeometry, drawingPositions, partGeometry } from '../model/partSheet'
import { resolveBodies } from '../model/resolve'
import type { Body } from '../model/types'
import { migrate } from '../persist/format'
import { bord as bordFile, nattduksbord as nattduksbordFile } from '../examples'

/**
 * Möblerna på startsidan: två av exempelmodellerna (src/examples), gjorda i appen.
 * Kaplistan och kapschemat räknas fram ur dem med appens egen kod, så att det som
 * visas är det appen faktiskt gör.
 */

function bodiesOf(file: unknown): Body[] {
  const r = migrate(file)
  if (!r.ok) throw new Error(`Startsidans modell går inte att läsa: ${r.reason}`)
  return resolveBodies(r.doc).filter((b) => !b.tool)
}

export const bord = bodiesOf(bordFile)
export const nattduksbord = bodiesOf(nattduksbordFile)

export const bordCutList = buildCutList(bord)

/**
 * Ritningen av bordet, som i appen (panel/Drawing): huvudvyerna och ett
 * detaljblad per position. Bladnumren räknas som där: sammanställningen,
 * huvudvyerna, detaljbladen, kaplistan och kapschemat.
 */
export const bordDrawing = (() => {
  const byId = new Map(bord.map((b) => [b.id, b]))
  const positions = drawingPositions(bord)
  const details = positions.map((row, i) => ({
    pos: i + 1,
    row,
    geometry: canonicalGeometry(partGeometry(byId.get(row.bodyIds[0]!)!)),
  }))
  const size = overallSize(bord)!
  return { details, size, sheets: 2 + details.length + 2 }
})()

/** Allt virke till bordet: brädorna per tjocklek, tjockast först. */
export const bordBoards = buildCutPlan(bord)
  .groups.flatMap((g) =>
    g.stocks
      .filter((layout) => layout.boards.length > 0)
      .map((layout) => ({
        key: `${g.key}|${layout.stock.length}x${layout.stock.width}`,
        material: g.material,
        layout,
      })),
  )
  .sort((a, b) => b.layout.thickness - a.layout.thickness)
