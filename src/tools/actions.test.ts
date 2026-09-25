import { beforeEach, describe, expect, it } from 'vitest'
import { resetDocumentStore, useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import { applyMeasure, commit, move, tap } from './actions'

const doc = () => useDocumentStore.getState().doc
const tools = () => useToolStore.getState()

/** Stråle rakt nedåt mot golvet (golvframens v = −Z, så lokalt y = −z). */
const down = (x: number, z: number) => ({ origin: [x, 5000, z] as [number, number, number], dir: [0, -1, 0] as [number, number, number] })

beforeEach(() => {
  resetDocumentStore()
  useToolStore.getState().setTool('select')
})

function drawGroundRect() {
  tools().setTool('rect')
  tap({ point: [3, 0, -2], target: { kind: 'ground' } }, 0)
  move(down(604, -398), 0)
  commit()
}

describe('rektangelverktyget', () => {
  it('ritar en skiss på golvet med snäppning till 10 mm', () => {
    drawGroundRect()
    expect(doc().sketches).toHaveLength(1)
    expect(doc().sketches[0]!.rect).toEqual({ x0: 0, y0: 0, x1: 600, y1: 400 })
    expect(tools().op).toBeNull()
    expect(tools().tool).toBe('rect')
  })

  it('tar exakta mått från måttfälten och behåller riktningen', () => {
    tools().setTool('rect')
    tap({ point: [0, 0, 0], target: { kind: 'ground' } }, 0)
    move(down(-300, 0), 0) // åt −x
    tools().setMeasure(0, '455,5')
    tools().setMeasure(1, '120')
    expect(applyMeasure()).toBe(true)
    expect(doc().sketches[0]!.rect).toEqual({ x0: -455.5, y0: 0, x1: 0, y1: 120 })
  })

  it('avvisar mått som inte går att tolka och behåller operationen', () => {
    tools().setTool('rect')
    tap({ point: [0, 0, 0], target: { kind: 'ground' } }, 0)
    tools().setMeasure(0, 'abc')
    expect(applyMeasure()).toBe(false)
    expect(tools().op).not.toBeNull()
  })

  it('skapar ingen skiss om rektangeln saknar yta', () => {
    tools().setTool('rect')
    tap({ point: [0, 0, 0], target: { kind: 'ground' } }, 0)
    commit()
    expect(doc().sketches).toHaveLength(0)
  })
})

describe('push/pull', () => {
  it('drar ut en skiss till en kropp med exakt avstånd', () => {
    drawGroundRect()
    const sketchId = doc().sketches[0]!.id
    tools().setTool('pushpull')
    tap({ point: [100, 0, -100], target: { kind: 'sketch', id: sketchId } }, 0)
    tools().setMeasure(0, '22')
    applyMeasure()
    expect(doc().sketches).toHaveLength(0)
    expect(doc().bodies[0]).toMatchObject({ name: 'Del 1', z0: 0, z1: 22, profile: { x0: 0, y0: 0, x1: 600, y1: 400 } })
  })

  it('följer pekaren längs normalen', () => {
    drawGroundRect()
    tools().setTool('pushpull')
    tap({ point: [100, 0, -100], target: { kind: 'sketch', id: doc().sketches[0]!.id } }, 0)
    // Horisontell stråle som passerar y = 45.
    move({ origin: [100, 45, 3000], dir: [0, 0, -1] }, 0)
    expect(tools().op).toMatchObject({ distance: 45 })
  })

  it('ändrar en befintlig kropps sida, och det går att ångra', () => {
    drawGroundRect()
    tools().setTool('pushpull')
    tap({ point: [0, 0, 0], target: { kind: 'sketch', id: doc().sketches[0]!.id } }, 0)
    tools().setMeasure(0, '22')
    applyMeasure()
    const id = doc().bodies[0]!.id

    tap({ point: [600, 11, -200], target: { kind: 'body', id, face: 'u+' } }, 0)
    tools().setMeasure(0, '100')
    applyMeasure()
    expect(doc().bodies[0]!.profile.x1).toBe(700)

    useDocumentStore.getState().undo()
    expect(doc().bodies[0]!.profile.x1).toBe(600)
    useDocumentStore.getState().redo()
    expect(doc().bodies[0]!.profile.x1).toBe(700)
  })

  it('minustecken vänder riktningen', () => {
    drawGroundRect()
    tools().setTool('pushpull')
    tap({ point: [0, 0, 0], target: { kind: 'sketch', id: doc().sketches[0]!.id } }, 0)
    tools().setMeasure(0, '-18')
    applyMeasure()
    expect(doc().bodies[0]).toMatchObject({ z0: -18, z1: 0 })
  })

  it('startar inte på golvet', () => {
    tools().setTool('pushpull')
    tap({ point: [0, 0, 0], target: { kind: 'ground' } }, 0)
    expect(tools().op).toBeNull()
  })
})

describe('rektangel på en kropps yta', () => {
  it('ritar i ytans plan och snäpper till ytans kanter', () => {
    drawGroundRect()
    tools().setTool('pushpull')
    tap({ point: [0, 0, 0], target: { kind: 'sketch', id: doc().sketches[0]!.id } }, 0)
    tools().setMeasure(0, '22')
    applyMeasure()
    const id = doc().bodies[0]!.id

    tools().setTool('rect')
    // Ovansidan ligger på y = 22. Klick nära hörnet (0, 22, 0) snäpper dit.
    tap({ point: [4, 22, -3], target: { kind: 'body', id, face: 'n+' } }, 10)
    move(down(597, -45), 10) // nära kanten x = 600
    commit()
    const s = doc().sketches[0]!
    expect(s.frame.origin).toEqual([0, 22, 0])
    expect(s.rect).toEqual({ x0: 0, y0: 0, x1: 600, y1: 50 })
  })
})

describe('välj', () => {
  it('väljer kropp och avmarkerar på golvet', () => {
    tap({ point: [0, 0, 0], target: { kind: 'body', id: 'x', face: 'n+' } }, 0)
    expect(useDocumentStore.getState().selection).toEqual({ kind: 'body', id: 'x' })
    tap({ point: [0, 0, 0], target: { kind: 'ground' } }, 0)
    expect(useDocumentStore.getState().selection).toBeNull()
  })
})
