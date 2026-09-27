import { beforeEach, describe, expect, it } from 'vitest'
import { GROUND_FRAME } from './frame'
import { buildCutList, paintText } from './cutlist'
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js'
import { export3mf, partMeshes } from '../scene/fileExport'
import { migrate, serialize } from '../persist/format'
import { resolveBodies } from './resolve'
import { resetDocumentStore, useDocumentStore } from '../store/documentStore'
import { testBody } from './testFixtures'

const s = () => useDocumentStore.getState()
const newPart = () => s().pushPullSketch(s().addSketch(GROUND_FRAME, { x0: 0, y0: 0, x1: 800, y1: 120 })!, 19)!

describe('färg på en del', () => {
  beforeEach(() => resetDocumentStore())

  it('gäller alla länkade kopior, och går att ta bort helt', () => {
    const a = newPart()
    const b = s().duplicateLinked(a)!
    s().updatePart(a, { paint: { color: '#f1efe9', code: 'NCS S 0502-Y' } })
    expect(resolveBodies(s().doc).map((x) => x.paint?.code)).toEqual(['NCS S 0502-Y', 'NCS S 0502-Y'])
    s().updatePart(b, { paint: undefined })
    expect(s().doc.defs[0]).not.toHaveProperty('paint')
    s().undo()
    expect(s().doc.defs[0]!.paint?.color).toBe('#f1efe9')
  })

  it('ger egna rader i kaplistan per färg, med koden', () => {
    const white = { color: '#ffffff', code: 'NCS S 0500-N' }
    const rows = buildCutList([
      testBody({ id: 'a', paint: white }),
      testBody({ id: 'b', paint: white }),
      testBody({ id: 'c', paint: { color: '#000000' } }),
      testBody({ id: 'd' }),
    ]).rows
    expect(rows.map((r) => [r.count, r.paint && paintText(r.paint)])).toEqual([
      [2, 'färg NCS S 0500-N'],
      [1, 'färg'],
      [1, undefined],
    ])
  })

  it('sparas och läses, och en trasig färg släpps utan att modellen avvisas', () => {
    newPart()
    const id = s().doc.instances[0]!.id
    s().updatePart(id, { paint: { color: '#A0B0C0', code: ' RAL 9010 ' } })
    const saved = JSON.parse(JSON.stringify(serialize(s().doc)))
    const back = migrate(saved)
    expect(back.ok && back.doc.defs[0]!.paint).toEqual({ color: '#a0b0c0', code: 'RAL 9010' })
    saved.doc.defs[0].paint = { color: 'röd' }
    const broken = migrate(saved)
    expect(broken.ok && broken.doc.defs[0]).not.toHaveProperty('paint')
  })

  it('ger 3MF-filen färgen och koden', () => {
    const bodies = [testBody({ id: 'a', material: 'mdf', paint: { color: '#112233', code: 'NCS S 8505-B' } })]
    expect(partMeshes(bodies, {}, 'z')[0]).toMatchObject({ material: 'NCS S 8505-B', color: '#112233' })
    const xml = strFromU8(unzipSync(export3mf(bodies))['3D/3dmodel.model']!)
    expect(xml).toContain('<base name="NCS S 8505-B" displaycolor="#112233"')
  })
})
