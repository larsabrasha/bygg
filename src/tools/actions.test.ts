import { beforeEach, describe, expect, it } from 'vitest'
import { resolveBodies } from '../model/resolve'
import type { Vec3 } from '../model/types'
import { resetDocumentStore, useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import { applyMeasure, beginPushPull, commit, hoverAt, move, opFocus, regrab, repeatLastPushPull, tap } from './actions'

const docs = () => useDocumentStore.getState()
const doc = () => docs().doc
const bodies = () => resolveBodies(doc())
const tools = () => useToolStore.getState()

/** Stråle rakt nedåt mot golvet (golvframens v = −Z, så lokalt y = −z). */
const down = (x: number, z: number) => ({ origin: [x, 5000, z] as Vec3, dir: [0, -1, 0] as Vec3 })

beforeEach(() => {
  resetDocumentStore()
  useToolStore.getState().setTool('select')
  useToolStore.setState({ lastPushPull: null })
})

function drawGroundRect(x0 = 0, z0 = 0, x1 = 600, z1 = -400) {
  tools().setTool('rect')
  tap({ point: [x0, 0, z0], target: { kind: 'ground' } }, 0)
  move(down(x1, z1), 0)
  commit()
  return doc().sketches.at(-1)!.id
}

function extrude(sketchId: string, text: string) {
  tools().setTool('pushpull')
  tap({ point: [0, 0, 0], target: { kind: 'sketch', id: sketchId } }, 0)
  tools().setMeasure(0, text)
  applyMeasure()
  return bodies().at(-1)!
}

describe('rektangelverktyget', () => {
  it('ritar en skiss på golvet med snäppning till 10 mm', () => {
    tools().setTool('rect')
    tap({ point: [3, 0, -2], target: { kind: 'ground' } }, 0)
    move(down(604, -398), 0)
    commit()
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

  it('avvisar mått som inte går att beräkna och behåller operationen', () => {
    tools().setTool('rect')
    tap({ point: [0, 0, 0], target: { kind: 'ground' } }, 0)
    tools().setMeasure(0, 'okänd')
    expect(applyMeasure()).toBe(false)
    expect(tools().op).not.toBeNull()
  })

  it('snäpper till en annan dels kant inom toleransen', () => {
    extrude(drawGroundRect(0, 0, 600, -400), '22')
    tools().setTool('rect')
    tap({ point: [1000, 0, 0], target: { kind: 'ground' } }, 0)
    // Kanten x = 600 är 7 mm bort; toleransen är 10.
    // y = 170 ligger inte nära något mål (0, 200 = kantmitt, 400), bara rutnätet.
    move(down(607, -171), 10)
    expect(tools().op).toMatchObject({ current: [600, 170], onTarget: [true, false] })
  })

  it('visar var första hörnet skulle snäppa innan man trycker', () => {
    extrude(drawGroundRect(), '22')
    tools().setTool('rect')
    hoverAt({ point: [597, 0, -3], target: { kind: 'ground' } }, 10)
    expect(tools().hoverPoint).toMatchObject({ point: [600, 0], onTarget: true })
  })
})

describe('push/pull', () => {
  it('drar ut en skiss till en del med exakt avstånd', () => {
    const b = extrude(drawGroundRect(), '22')
    expect(doc().sketches).toHaveLength(0)
    expect(b).toMatchObject({ name: 'Del 1', z0: 0, z1: 22, profile: { x0: 0, y0: 0, x1: 600, y1: 400 } })
  })

  it('följer pekaren längs normalen', () => {
    const s = drawGroundRect()
    tools().setTool('pushpull')
    tap({ point: [100, 0, -100], target: { kind: 'sketch', id: s } }, 0)
    move({ origin: [100, 45, 3000], dir: [0, 0, -1] }, 0)
    expect(tools().op).toMatchObject({ distance: 45 })
  })

  it('snäpper till jämnhöjd med en annan del', () => {
    extrude(drawGroundRect(0, 0, 600, -400), '700')
    const s = drawGroundRect(1000, 0, 1400, -400)
    tools().setTool('pushpull')
    tap({ point: [1100, 0, -100], target: { kind: 'sketch', id: s } }, 0)
    move({ origin: [1100, 693, 3000], dir: [0, 0, -1] }, 10)
    expect(tools().op).toMatchObject({ distance: 700, onTarget: true })
  })

  it('ändrar en befintlig dels sida, och det går att ångra', () => {
    const b = extrude(drawGroundRect(), '22')
    tap({ point: [600, 11, -200], target: { kind: 'body', id: b.id, face: 'u+' } }, 0)
    tools().setMeasure(0, '100')
    applyMeasure()
    expect(bodies()[0]!.profile.x1).toBe(700)
    docs().undo()
    expect(bodies()[0]!.profile.x1).toBe(600)
    docs().redo()
    expect(bodies()[0]!.profile.x1).toBe(700)
  })

  it('minustecken vänder riktningen', () => {
    expect(extrude(drawGroundRect(), '-18')).toMatchObject({ z0: -18, z1: 0 })
  })

  it('upprepar förra djupet på nästa skiss', () => {
    extrude(drawGroundRect(), '22')
    const s = drawGroundRect(1000, 0, 1400, -400)
    tools().setTool('pushpull')
    tap({ point: [1100, 0, -100], target: { kind: 'sketch', id: s } }, 0)
    expect(repeatLastPushPull()).toBe(true)
    expect(bodies()[1]).toMatchObject({ z0: 0, z1: 22 })
    expect(tools().op).toBeNull()
  })

  it('upprepar inte utan förra djup, och sparar inte ett nolldrag', () => {
    const s = drawGroundRect()
    tools().setTool('pushpull')
    tap({ point: [100, 0, -100], target: { kind: 'sketch', id: s } }, 0)
    commit()
    expect(tools().lastPushPull).toBeNull()
    tap({ point: [100, 0, -100], target: { kind: 'sketch', id: s } }, 0)
    expect(repeatLastPushPull()).toBe(false)
    expect(tools().op).not.toBeNull()
  })

  it('Dra ut startar push/pull från skissens mitt och stannar i Välj', () => {
    const s = drawGroundRect(0, 0, 600, -400)
    tools().setTool('select')
    beginPushPull({ kind: 'sketch', id: s })
    expect(tools().tool).toBe('select')
    expect(tools().op).toMatchObject({ kind: 'pushpull', anchor: [300, 0, -200], distance: 0 })
    tools().setMeasure(0, '18')
    applyMeasure()
    expect(bodies()[0]).toMatchObject({ z0: 0, z1: 18 })
  })

  it('startar inte på golvet', () => {
    tools().setTool('pushpull')
    tap({ point: [0, 0, 0], target: { kind: 'ground' } }, 0)
    expect(tools().op).toBeNull()
  })
})

describe('rektangel på en dels yta', () => {
  it('ritar i ytans plan och snäpper till ytans kanter', () => {
    const b = extrude(drawGroundRect(), '22')
    tools().setTool('rect')
    // Ovansidan ligger på y = 22. Klick nära hörnet (0, 22, 0) snäpper dit.
    tap({ point: [4, 22, -3], target: { kind: 'body', id: b.id, face: 'n+' } }, 10)
    move(down(597, -45), 10) // nära kanten x = 600
    commit()
    const s = doc().sketches[0]!
    expect(s.frame.origin).toEqual([0, 22, 0])
    expect(s.rect).toEqual({ x0: 0, y0: 0, x1: 600, y1: 50 })
  })
})

describe('flytta', () => {
  it('flyttar en kopia i planet för sidan man trycker på, med axellås', () => {
    const b = extrude(drawGroundRect(), '22')
    tools().setTool('move')
    tap({ point: [100, 22, -100], target: { kind: 'body', id: b.id, face: 'n+' } }, 0)
    // Ovansidans frame: u = +X, v = −Z. Dra 400 i x och 20 i −z: låses till bara x.
    move(down(500, -120), 0)
    expect(tools().op).toMatchObject({ delta: [400, 0] })
    commit()
    expect(bodies()[0]!.frame.origin).toEqual([400, 0, 0])
    // En flytt i taget: sedan tillbaka i Välj.
    expect(tools().tool).toBe('select')
  })

  it('skriver exakt avstånd längs dragriktningen', () => {
    const b = extrude(drawGroundRect(), '22')
    tools().setTool('move')
    tap({ point: [100, 22, -100], target: { kind: 'body', id: b.id, face: 'n+' } }, 0)
    move(down(300, -100), 0)
    tools().setMeasure(0, '1000')
    applyMeasure()
    expect(bodies()[0]!.frame.origin).toEqual([1000, 0, 0])
  })

  it('snäpper så att delen hamnar kant i kant med en annan', () => {
    extrude(drawGroundRect(0, 0, 600, -400), '22')
    const b = extrude(drawGroundRect(1000, 0, 1200, -400), '22')
    tools().setTool('move')
    tap({ point: [1100, 22, -200], target: { kind: 'body', id: b.id, face: 'n+' } }, 0)
    // Dra −393: vänsterkant 1000 − 393 = 607, nära den andras högerkant 600.
    move(down(1100 - 393, -200), 10)
    expect(tools().op).toMatchObject({ delta: [-400, 0], onTarget: [true, false] })
  })
})

describe('uttryck i måttfälten', () => {
  it('sparar uttryck med parametrar och följer parametern', () => {
    const id = docs().addParam()
    docs().updateParam(id, { name: 't', expr: '22' })
    const b = extrude(drawGroundRect(), 't')
    expect(b.z1).toBe(22)
    docs().updateParam(id, { expr: '18' })
    expect(bodies()[0]).toMatchObject({ z0: 0, z1: 18 })
  })

  it('förra djupet följer parametern om det var ett uttryck', () => {
    const id = docs().addParam()
    docs().updateParam(id, { name: 't', expr: '22' })
    extrude(drawGroundRect(), 't')
    const s = drawGroundRect(1000, 0, 1400, -400)
    tools().setTool('pushpull')
    tap({ point: [1100, 0, -100], target: { kind: 'sketch', id: s } }, 0)
    repeatLastPushPull()
    docs().updateParam(id, { expr: '18' })
    expect(bodies().map((b) => b.z1)).toEqual([18, 18])
  })

  it('rektangelns mått kan vara uttryck', () => {
    const id = docs().addParam()
    docs().updateParam(id, { name: 'bredd', expr: '500' })
    tools().setTool('rect')
    tap({ point: [0, 0, 0], target: { kind: 'ground' } }, 0)
    move(down(100, -100), 0)
    tools().setMeasure(0, 'bredd')
    tools().setMeasure(1, 'bredd / 2')
    applyMeasure()
    docs().updateParam(id, { expr: '800' })
    expect(doc().sketches[0]!.rect).toEqual({ x0: 0, y0: 0, x1: 800, y1: 400 })
  })
})

describe('pilen på det valda', () => {
  const handle = { point: [0, 0, 0] as Vec3, target: { kind: 'handle' } as const }

  it('drar ut den valda ytan och behåller ytan vald', () => {
    const b = extrude(drawGroundRect(), '22')
    tools().setTool('select')
    tap({ point: [600, 11, -200], target: { kind: 'body', id: b.id, face: 'u+' } }, 0)
    tap(handle, 0)
    expect(tools().op).toMatchObject({ kind: 'pushpull', anchor: [600, 11, -200], normal: [1, 0, 0] })
    tools().setMeasure(0, '50')
    applyMeasure()
    expect(bodies()[0]!.profile.x1).toBe(650)
    expect(docs().selection).toEqual({ kind: 'body', id: b.id, face: 'u+' })
    expect(tools().tool).toBe('select')
  })

  it('en utdragen skiss blir en del med ovansidan vald', () => {
    const b = extrude(drawGroundRect(), '22')
    expect(docs().selection).toEqual({ kind: 'body', id: b.id, face: 'n+' })
    expect(extrude(drawGroundRect(1000, 0, 1400, -400), '-18')).toBeDefined()
    expect(docs().selection).toMatchObject({ face: 'n-' })
  })

  it('mäter från där man tog tag i pilen, så att ytan inte hoppar', () => {
    const b = extrude(drawGroundRect(), '22')
    tools().setTool('select')
    tap({ point: [300, 22, -200], target: { kind: 'body', id: b.id, face: 'n+' } }, 0)
    // Pilens mitt, 50 mm ovanför ovansidan.
    tap({ point: [300, 72, -200], target: { kind: 'handle' } }, 0)
    const ray = (y: number) => ({ origin: [300, y, 3000] as Vec3, dir: [0, 0, -1] as Vec3 })
    move(ray(72), 0)
    expect(tools().op).toMatchObject({ distance: 0 })
    move(ray(102), 0)
    expect(tools().op).toMatchObject({ distance: 30 })
  })

  it('ett nytt tryck var som helst tar tag där ytan är, utan hopp', () => {
    const b = extrude(drawGroundRect(), '22')
    tools().setTool('select')
    tap({ point: [300, 22, -200], target: { kind: 'body', id: b.id, face: 'n+' } }, 0)
    tap({ point: [300, 72, -200], target: { kind: 'handle' } }, 0)
    const ray = (y: number) => ({ origin: [300, y, 3000] as Vec3, dir: [0, 0, -1] as Vec3 })
    move(ray(102), 0)
    expect(tools().op).toMatchObject({ distance: 30 })
    // Släpp och tryck långt ovanför: ytan ligger kvar på 30.
    regrab(ray(500))
    move(ray(500), 0)
    expect(tools().op).toMatchObject({ distance: 30 })
    move(ray(510), 0)
    expect(tools().op).toMatchObject({ distance: 40 })
  })

  it('arbetspunkten för snäpptoleransen följer ytan', () => {
    const b = extrude(drawGroundRect(), '22')
    tools().setTool('select')
    tap({ point: [300, 22, -200], target: { kind: 'body', id: b.id, face: 'n+' } }, 0)
    tap({ point: [300, 72, -200], target: { kind: 'handle' } }, 0)
    move({ origin: [300, 172, 3000], dir: [0, 0, -1] }, 0)
    expect(opFocus(tools().op!)).toEqual([300, 122, -200])
  })

  it('fungerar direkt efter en ny rektangel, utan att byta till Välj', () => {
    drawGroundRect()
    expect(tools().tool).toBe('rect')
    tap(handle, 0)
    tools().setMeasure(0, '22')
    applyMeasure()
    expect(bodies()[0]).toMatchObject({ z0: 0, z1: 22 })
    expect(tools().tool).toBe('rect')
  })

  it('gör inget om delen är vald utan yta (t.ex. från kaplistan)', () => {
    const b = extrude(drawGroundRect(), '22')
    docs().select({ kind: 'body', id: b.id })
    tools().setTool('select')
    tap(handle, 0)
    expect(tools().op).toBeNull()
  })
})

describe('välj', () => {
  it('väljer del och avmarkerar på golvet', () => {
    tap({ point: [0, 0, 0], target: { kind: 'body', id: 'x', face: 'n+' } }, 0)
    expect(docs().selection).toEqual({ kind: 'body', id: 'x', face: 'n+' })
    tap({ point: [0, 0, 0], target: { kind: 'ground' } }, 0)
    expect(docs().selection).toBeNull()
  })
})
