import { beforeEach, describe, expect, it } from 'vitest'
import { GROUND_FRAME } from '../model/frame'
import { HISTORY_LIMIT, resetDocumentStore, useDocumentStore } from '../store/documentStore'
import { packHistory, unpackHistory } from './history'

const docs = () => useDocumentStore.getState()
const SAVED = '2026-09-26T21:00:00.000Z'

/** Tre delar och några flyttar, så att historiken har flera steg som delar det mesta. */
function build() {
  for (let k = 0; k < 3; k++) {
    const s = docs().addSketch(GROUND_FRAME, { x0: k * 700, y0: 0, x1: k * 700 + 600, y1: 400 })!
    docs().pushPullSketch(s, 22)
  }
  const id = docs().doc.instances[0]!.id
  for (let k = 0; k < 5; k++) docs().moveInstance(id, [10, 0, 0])
  docs().undo()
  docs().undo()
}

/** Som i IndexedDB: en kopia utan delade referenser (structured clone). */
const stored = (x: unknown) => structuredClone(x)

beforeEach(() => resetDocumentStore())

describe('ångra-historiken', () => {
  it('kommer tillbaka likadan, och ångra och gör om fungerar efter inläsningen', () => {
    build()
    const { doc, past, future } = docs()
    const h = unpackHistory(stored(packHistory(past, future, SAVED)), SAVED)!
    expect(h.past).toEqual(past)
    expect(h.future).toEqual(future)

    docs().load(doc)
    expect(docs().past).toEqual([])
    docs().setHistory(h.past, h.future)
    docs().redo()
    docs().redo()
    expect(docs().doc.instances[0]!.frame.origin[0]).toBe(50)
    for (let k = 0; k < 20; k++) docs().undo()
    expect(docs().doc.instances).toEqual([])
  })

  it('sparar varje del en gång, fast den finns i många steg', () => {
    build()
    const { past, future } = docs()
    const h = packHistory(past, future, SAVED)
    const refs = [...h.past, ...h.future].reduce(
      (n, e) => n + e.instances.length + e.defs.length + e.sketches.length,
      0,
    )
    expect(h.pool.length).toBeLessThan(refs / 2)
    // De som är lika efter inläsningen är samma objekt igen, som i storen.
    const back = unpackHistory(stored(h), SAVED)!
    const last = back.past.at(-1)!
    expect(back.past.at(-2)!.doc.defs[1]).toBe(last.doc.defs[1])
  })

  it('slängs om modellen sparats någon annanstans sedan (annan savedAt)', () => {
    build()
    const h = stored(packHistory(docs().past, docs().future, SAVED))
    expect(unpackHistory(h, '2026-09-27T08:00:00.000Z')).toBeNull()
  })

  it('slängs om den är trasig eller från en annan version av formatet', () => {
    build()
    const h = stored(packHistory(docs().past, docs().future, SAVED)) as ReturnType<typeof packHistory>
    expect(unpackHistory(undefined, SAVED)).toBeNull()
    expect(unpackHistory({ ...h, version: h.version - 1 }, SAVED)).toBeNull()
    expect(unpackHistory({ ...h, past: [{ ...h.past[0]!, defs: [9999] }] }, SAVED)).toBeNull()
    expect(unpackHistory({ ...h, pool: h.pool.map(() => ({ trasig: true })) }, SAVED)).toBeNull()
  })

  it('ett val som inte går att läsa blir inget val', () => {
    build()
    const h = stored(packHistory(docs().past, docs().future, SAVED)) as ReturnType<typeof packHistory>
    const odd = { ...h, past: h.past.map((e) => ({ ...e, selection: { kind: 'något', id: 3 } as never })) }
    expect(unpackHistory(odd, SAVED)!.past.every((e) => e.selection === null)).toBe(true)
  })

  it('håller längre än förut, men inte obegränsat', () => {
    const s = docs().addSketch(GROUND_FRAME, { x0: 0, y0: 0, x1: 600, y1: 400 })!
    docs().pushPullSketch(s, 22)
    const id = docs().doc.instances[0]!.id
    for (let k = 0; k < HISTORY_LIMIT + 10; k++) docs().moveInstance(id, [1, 0, 0])
    expect(docs().past).toHaveLength(HISTORY_LIMIT)
    expect(HISTORY_LIMIT).toBeGreaterThan(100)
  })
})

describe('ångra-historiken med lagermått', () => {
  it('får med lagermåtten i varje steg', () => {
    build()
    docs().setStockSize('furu|22', { length: 2400, width: 145 })
    docs().setKerf(2)
    const { past, future } = docs()
    const h = unpackHistory(stored(packHistory(past, future, SAVED)), SAVED)!
    expect(h.past).toEqual(past)
    expect(h.past.at(-1)!.doc.stock).toEqual({ sizes: { 'furu|22': { length: 2400, width: 145 } } })
  })
})
