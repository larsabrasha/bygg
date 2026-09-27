import { describe, expect, it } from 'vitest'
import { EXAMPLES } from '../examples'
import { migrate } from '../persist/format'
import { canonicalGeometry, drawingPositions, layoutPartSheet, partGeometry, type SheetDim } from './partSheet'
import { resolveBodies } from './resolve'

/** Textens ruta på papperet, ungefär som i PartSheet.tsx (2,8 mm text, 1,65 mm per tecken). */
const box = (d: SheetDim) => {
  const w = d.text.length * 1.65
  return d.vertical
    ? { x0: d.tx - 2.2, x1: d.tx + 0.6, y0: d.ty - w / 2, y1: d.ty + w / 2 }
    : { x0: d.tx - w / 2, x1: d.tx + w / 2, y0: d.ty - 2.2, y1: d.ty + 0.6 }
}
const overlap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
  a.x0 < b.x1 - 0.05 && b.x0 < a.x1 - 0.05 && a.y0 < b.y1 - 0.05 && b.y0 < a.y1 - 0.05

describe('måttens texter på detaljbladen', () => {
  it('står inte ovanpå varandra i exempelmodellerna, också där korta mått ligger tätt', () => {
    const crowded: string[] = []
    for (const example of EXAMPLES) {
      const r = migrate(example.file)
      if (!r.ok) throw new Error(r.reason)
      const bodies = resolveBodies(r.doc).filter((b) => !b.tool)
      const byId = new Map(bodies.map((b) => [b.id, b]))
      for (const row of drawingPositions(bodies)) {
        const layout = layoutPartSheet(canonicalGeometry(partGeometry(byId.get(row.bodyIds[0]!)!)))
        for (const dims of [layout.dims, ...layout.details.map((d) => d.dims)]) {
          const boxes = dims.map(box)
          boxes.forEach((a, i) =>
            boxes.slice(i + 1).forEach((b, j) => {
              if (overlap(a, b))
                crowded.push(`${example.name} · ${row.names[0]}: ${dims[i]!.text} och ${dims[i + 1 + j]!.text}`)
            }),
          )
        }
      }
    }
    expect(crowded).toEqual([])
  })
})
