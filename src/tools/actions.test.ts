import { beforeEach, describe, expect, it } from 'vitest'
import { bodyCenter } from '../model/geometry'
import { resolveBodies } from '../model/resolve'
import type { Vec3 } from '../model/types'
import { resetDocumentStore, useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import {
  amendableOp,
  amendLast,
  applyMeasure,
  beginPushPull,
  commit,
  extendCopies,
  hoverAt,
  move,
  opFocus,
  regrab,
  repeatLastPushPull,
  setCopy,
  tap,
} from './actions'
import { COPY_PREVIEW_ID, previewDoc } from './preview'

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
    // Man stannar i Flytta, och delen man tog i är vald (så att pilarna syns på den).
    expect(tools().tool).toBe('move')
    expect(docs().selection).toMatchObject({ kind: 'body', id: b.id })
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

describe('flyttpilarna', () => {
  /** Stråle rakt in i skärmen (−z), mot en punkt på höjd y. */
  const front = (x: number, y: number) => ({ origin: [x, y, 3000] as Vec3, dir: [0, 0, -1] as Vec3 })

  it('flyttar bara längs pilens axel, hur snett man än drar', () => {
    const b = extrude(drawGroundRect(), '22')
    docs().select({ kind: 'body', id: b.id })
    tools().setTool('move')
    // Mitten: (300, 11, −200). Ta i X-pilen en bit ut, dra 250 åt höger och 80 uppåt.
    tap({ point: [360, 11, -200], target: { kind: 'axis', axis: 0 } }, 0)
    regrab(front(360, 11))
    expect(tools().op).toMatchObject({ axis: 0, grab: 60 })
    move(front(610, 91), 0)
    expect(tools().op).toMatchObject({ delta: [250, 0] })
    commit()
    expect(bodies()[0]!.frame.origin).toEqual([250, 0, 0])
    expect(tools().tool).toBe('move')
  })

  it('Y-pilen lyfter delen, och ett skrivet mått följer dragriktningen', () => {
    const b = extrude(drawGroundRect(), '22')
    docs().select({ kind: 'body', id: b.id })
    tools().setTool('move')
    tap({ point: [300, 11, -200], target: { kind: 'axis', axis: 1 } }, 0)
    regrab(front(300, 11))
    move(front(300, -89), 0) // nedåt
    tools().setMeasure(0, '300')
    applyMeasure()
    expect(bodies()[0]!.frame.origin).toEqual([0, -300, 0])
  })

  it('skrivet mått utan att dra går åt pilens håll', () => {
    const b = extrude(drawGroundRect(), '22')
    docs().select({ kind: 'body', id: b.id })
    tools().setTool('move')
    tap({ point: [300, 11, -200], target: { kind: 'axis', axis: 2 } }, 0)
    tools().setMeasure(0, '150')
    applyMeasure()
    expect(bodies()[0]!.frame.origin).toEqual([0, 0, 150])
  })

  it('snäpper så att delen hamnar kant i kant längs axeln', () => {
    extrude(drawGroundRect(0, 0, 600, -400), '22')
    const b = extrude(drawGroundRect(1000, 0, 1200, -400), '22')
    docs().select({ kind: 'body', id: b.id })
    tools().setTool('move')
    tap({ point: [1100, 11, -200], target: { kind: 'axis', axis: 0 } }, 0)
    regrab(front(1100, 11))
    move(front(1100 - 393, 11), 10)
    expect(tools().op).toMatchObject({ delta: [-400, 0], onTarget: [true, false] })
  })

  it('bågen vrider delen runt Y i steg om 15°, och Flytta-läget står kvar', () => {
    const b = extrude(drawGroundRect(), '22')
    docs().select({ kind: 'body', id: b.id })
    tools().setTool('move')
    // Mitten (300, 11, −200). Vridplanet runt Y har u = Z och v = X.
    tap({ point: [300, 11, -200], target: { kind: 'rotate', axis: 1 } }, 0)
    const above = (x: number, z: number) => down(300 + x, -200 + z)
    regrab(above(0, 100)) // tar tag vid +Z (0°)
    move(above(100, 106), 0) // ~43°: blir 45°
    expect(tools().op).toMatchObject({ angle: 45 })
    move(above(100, 3), 0) // ~88°: blir 90°
    commit()
    const f = bodies()[0]!.frame
    // Golvframens u = +X vrids 90° runt Y till −Z; mitten står still.
    expect(f.u).toEqual([0, 0, -1])
    expect(bodyCenter(bodies()[0]!)).toEqual([300, 11, -200])
    expect(tools().tool).toBe('move')
  })

  it('räknar vinkeln förbi 180° utan att hoppa', () => {
    const b = extrude(drawGroundRect(), '22')
    docs().select({ kind: 'body', id: b.id })
    tools().setTool('move')
    tap({ point: [300, 11, -200], target: { kind: 'rotate', axis: 1 } }, 0)
    const at = (deg: number) => {
      const a = (deg * Math.PI) / 180
      // u = Z, v = X i vridplanet.
      return down(300 + 100 * Math.sin(a), -200 + 100 * Math.cos(a))
    }
    regrab(at(0))
    for (const deg of [60, 120, 170, 200, 250]) move(at(deg), 0)
    expect(tools().op).toMatchObject({ angle: 255 })
  })

  it('skriven vinkel följer dragriktningen', () => {
    const b = extrude(drawGroundRect(), '22')
    docs().select({ kind: 'body', id: b.id })
    tools().setTool('move')
    tap({ point: [300, 11, -200], target: { kind: 'rotate', axis: 1 } }, 0)
    regrab(down(300, -100)) // 0°
    move(down(200, -100 - 0.001), 0) // åt −X: negativ vinkel
    expect((tools().op as { angle: number }).angle).toBeLessThan(0)
    tools().setMeasure(0, '90')
    applyMeasure()
    // −90° runt Y: +X blir +Z.
    expect(bodies()[0]!.frame.u).toEqual([0, 0, 1])
  })

  it('startar inte utan vald del', () => {
    extrude(drawGroundRect(), '22')
    docs().select(null)
    tools().setTool('move')
    tap({ point: [0, 0, 0], target: { kind: 'axis', axis: 0 } }, 0)
    expect(tools().op).toBeNull()
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

describe('kopia i Flytta-läget', () => {
  const front = (x: number, y: number) => ({ origin: [x, y, 3000] as Vec3, dir: [0, 0, -1] as Vec3 })

  /** Del 600 × 22 × 400 på golvet, vald, i Flytta med Kopia på. */
  function setup() {
    const b = extrude(drawGroundRect(), '22')
    docs().select({ kind: 'body', id: b.id })
    tools().setTool('move')
    setCopy(true)
    return b
  }

  function dragX(dx: number) {
    tap({ point: [300, 11, -200], target: { kind: 'axis', axis: 0 } }, 0)
    regrab(front(300, 11))
    move(front(300 + dx, 11), 0)
  }

  it('lämnar originalet och gör en länkad kopia där man släpper', () => {
    const b = setup()
    dragX(700)
    commit()
    expect(bodies().map((x) => x.frame.origin)).toEqual([
      [0, 0, 0],
      [700, 0, 0],
    ])
    const copy = bodies()[1]!
    expect(copy.defId).toBe(b.defId)
    expect(docs().selection).toEqual({ kind: 'body', id: copy.id })
  })

  it('förhandsvisar kopian och låter originalet stå kvar', () => {
    setup()
    dragX(700)
    const p = previewDoc(tools().op!, doc(), true)!
    expect(p.doc.instances.map((i) => i.frame.origin)).toEqual([
      [0, 0, 0],
      [700, 0, 0],
    ])
    expect([...p.affected]).toEqual([COPY_PREVIEW_ID])
  })

  it('ett antal efteråt ger en rad kopior med samma steg', () => {
    setup()
    dragX(700)
    commit()
    tools().setMeasure(0, '4')
    expect(applyMeasure()).toBe(true)
    expect(bodies().map((x) => x.frame.origin[0])).toEqual([0, 700, 1400, 2100, 2800])
    // Ökar man igen fortsätter raden; färre går inte (det gör Ångra).
    expect(extendCopies(5)).toBe(true)
    expect(bodies()).toHaveLength(6)
    expect(extendCopies(3)).toBe(false)
  })

  it('vridning med kopia och antal ger kopior i steg runt mitten', () => {
    setup()
    tap({ point: [300, 11, -200], target: { kind: 'rotate', axis: 1 } }, 0)
    tools().setMeasure(0, '90')
    applyMeasure()
    expect(extendCopies(3)).toBe(true)
    expect(bodies().map((x) => x.frame.u)).toEqual([
      [1, 0, 0],
      [0, 0, -1],
      [-1, 0, 0],
      [0, 0, 1],
    ])
  })

  it('antalet gäller inte längre efter Ångra eller en ny flytt', () => {
    setup()
    dragX(700)
    commit()
    docs().undo()
    expect(extendCopies(4)).toBe(false)

    dragX(700)
    commit()
    setCopy(false)
    dragX(100) // flyttar kopian
    commit()
    expect(extendCopies(4)).toBe(false)
  })

  it('avmarkerar man lämnar man Flytta, så att nästa val börjar i Välj', () => {
    setup()
    docs().select(null)
    expect(tools().tool).toBe('select')
    expect(tools().copy).toBe(false)
  })

  it('Kopia slås av när man lämnar Flytta', () => {
    setup()
    tools().setTool('select')
    expect(tools().copy).toBe(false)
  })

  it('en nolldragning gör ingen kopia', () => {
    setup()
    dragX(0)
    commit()
    expect(bodies()).toHaveLength(1)
  })
})

describe('ändra efteråt', () => {
  it('en utdragen skiss kan få ett annat djup efteråt, i ett steg i historiken', () => {
    const b = extrude(drawGroundRect(), '22')
    expect(amendableOp()).not.toBeNull()
    const steps = docs().past.length
    tools().setMeasure(0, '44')
    expect(applyMeasure()).toBe(true)
    const after = bodies()
    expect(after).toHaveLength(1)
    expect(after[0]!.z1 - after[0]!.z0).toBe(44)
    expect(after[0]!.id).not.toBe(b.id)
    expect(docs().past.length).toBe(steps)
    // Rutan ligger kvar med det nya värdet.
    expect(amendableOp()?.op).toMatchObject({ distance: 44 })
  })

  it('en rektangel kan få andra mått efteråt; tomt fält behåller värdet', () => {
    drawGroundRect(0, 0, 600, -400)
    tools().setMeasure(1, '250')
    expect(amendLast()).toBe(true)
    expect(doc().sketches).toHaveLength(1)
    expect(doc().sketches[0]!.rect).toEqual({ x0: 0, y0: 0, x1: 600, y1: 250 })
  })

  it('en flytt längs en pil kan få ett annat avstånd efteråt', () => {
    const b = extrude(drawGroundRect(), '22')
    docs().select({ kind: 'body', id: b.id })
    tools().setTool('move')
    tap({ point: [300, 11, -200], target: { kind: 'axis', axis: 0 } }, 0)
    tools().setMeasure(0, '100')
    applyMeasure()
    tools().setMeasure(0, '-50')
    expect(applyMeasure()).toBe(true)
    expect(bodies()[0]!.frame.origin).toEqual([-50, 0, 0])
  })

  it('ett mått som inte går att beräkna ändrar inget', () => {
    extrude(drawGroundRect(), '22')
    const before = doc()
    tools().setMeasure(0, 'okänd')
    expect(applyMeasure()).toBe(false)
    expect(bodies()[0]!.z1 - bodies()[0]!.z0).toBe(22)
    expect(doc()).toEqual(before)
    expect(tools().op).toBeNull()
    expect(tools().measure[0]).toBe('okänd')
    expect(amendableOp()).not.toBeNull()
  })

  it('går inte längre att ändra när något annat hänt', () => {
    const b = extrude(drawGroundRect(), '22')
    docs().updatePart(b.id, { name: 'Sida' })
    expect(amendableOp()).toBeNull()

    const c = extrude(drawGroundRect(1000, 0, 1200, -200), '22')
    expect(amendableOp()).not.toBeNull()
    docs().select({ kind: 'body', id: c.id }) // annat val (utan yta)
    expect(amendableOp()).toBeNull()
  })

  it('tomt fält och Enter stänger bara rutan', () => {
    extrude(drawGroundRect(), '22')
    const before = doc()
    expect(applyMeasure()).toBe(true)
    expect(amendableOp()).toBeNull()
    expect(doc()).toBe(before)
  })
})

describe('mät', () => {
  it('mäter från golvet till ovansidan av en del, vinkelrätt', () => {
    const b = extrude(drawGroundRect(), '22')
    tools().setTool('measure')
    tap({ point: [1000, 0, 500], target: { kind: 'ground' } }, 0)
    expect(tools().ruler).toHaveLength(1)
    tap({ point: [300, 22, -200], target: { kind: 'body', id: b.id, face: 'n+' } }, 1)
    const [a, c] = tools().ruler
    expect(a!.normal).toEqual([0, 1, 0])
    expect(c).toMatchObject({ point: [300, 22, -200], snap: null })
  })

  it('snäpper till ett hörn och börjar om vid tredje trycket', () => {
    const b = extrude(drawGroundRect(), '22')
    tools().setTool('measure')
    tap({ point: [3, 22, -2], target: { kind: 'body', id: b.id, face: 'n+' } }, 10)
    expect(tools().ruler[0]).toMatchObject({ point: [0, 22, 0], snap: 'corner' })
    tap({ point: [600, 22, -400], target: { kind: 'body', id: b.id, face: 'n+' } }, 10)
    tap({ point: [0, 0, 0], target: { kind: 'ground' } }, 0)
    expect(tools().ruler).toHaveLength(1)
  })

  it('gör inget med tryck bredvid modellen och rör inte valet', () => {
    const b = extrude(drawGroundRect(), '22')
    docs().select({ kind: 'body', id: b.id })
    tools().setTool('measure')
    tap(null, 0)
    expect(tools().ruler).toHaveLength(0)
    expect(docs().selection).toEqual({ kind: 'body', id: b.id })
  })

  it('glömmer mätningen när man byter verktyg', () => {
    tools().setTool('measure')
    tap({ point: [0, 0, 0], target: { kind: 'ground' } }, 0)
    tools().setTool('select')
    expect(tools().ruler).toHaveLength(0)
  })
})
