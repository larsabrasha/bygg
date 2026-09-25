import { describe, expect, it } from 'vitest'
import type { Op } from '../store/toolStore'
import {
  afterTapStart,
  cameraButtons,
  fingerOnlyCamera,
  fingerTap,
  hovers,
  inSystemEdge,
  movesCamera,
  isDoubleTap,
  pickable,
  pressOwner,
  snapPx,
} from './gestures'

describe('pressOwner', () => {
  it('ger alltid verktyget trycket under en operation', () => {
    expect(pressOwner('select', true, 'touch', null)).toBe('tool')
    expect(pressOwner('rect', true, 'mouse', null)).toBe('tool')
  })

  it('låter Välj-läget vrida kameran även på en del, men pilen drar ut', () => {
    expect(pressOwner('select', false, 'touch', 'body')).toBe('camera')
    expect(pressOwner('select', false, 'touch', 'handle')).toBe('tool')
    expect(pressOwner('rect', false, 'mouse', 'handle')).toBe('tool')
  })

  it('låter Mät vrida kameran; man mäter med ett tryck', () => {
    expect(pressOwner('measure', false, 'touch', 'body')).toBe('camera')
    expect(cameraButtons('measure', 'camera').two).toBe('dollyTruck')
  })

  it('ritar rektangel med finger och penna men vrider kameran med mus', () => {
    expect(pressOwner('rect', false, 'touch', 'ground')).toBe('tool')
    expect(pressOwner('rect', false, 'pen', 'body')).toBe('tool')
    expect(pressOwner('rect', false, 'mouse', 'ground')).toBe('camera')
    expect(pressOwner('rect', false, 'touch', null)).toBe('camera')
  })

  it('drar ut en skiss eller yta direkt men vrider kameran bredvid modellen', () => {
    expect(pressOwner('pushpull', false, 'touch', 'sketch')).toBe('tool')
    expect(pressOwner('pushpull', false, 'mouse', 'body')).toBe('tool')
    expect(pressOwner('pushpull', false, 'touch', 'ground')).toBe('camera')
    expect(pressOwner('move', false, 'touch', 'body', true)).toBe('tool')
    expect(pressOwner('move', false, 'touch', 'body')).toBe('camera')
    expect(pressOwner('move', false, 'mouse', 'ground')).toBe('camera')
    expect(pressOwner('move', false, 'mouse', 'axis')).toBe('tool')
    expect(pressOwner('move', false, 'touch', 'rotate')).toBe('tool')
    expect(pressOwner('move', false, 'touch', 'sketch')).toBe('camera')
  })
})

describe('cameraButtons', () => {
  it('vrider med vänsterknapp och ett finger när kameran äger trycket', () => {
    const b = cameraButtons('select', 'camera')
    expect([b.left, b.one, b.two, b.three]).toEqual(['rotate', 'rotate', 'dollyTruck', 'truck'])
  })

  it('låter verktyget få vänsterknapp och ett finger; mittknappen vrider då', () => {
    const b = cameraButtons('pushpull', 'tool')
    expect([b.left, b.middle, b.one]).toEqual(['none', 'rotate', 'none'])
  })

  it('vrider med två fingrar i verktygslägena', () => {
    expect(cameraButtons('rect', 'tool').two).toBe('dollyRotate')
    expect(cameraButtons('pushpull', 'camera').two).toBe('dollyRotate')
  })
})

describe('inSystemEdge', () => {
  const screen = { left: 0, right: 1366, bottom: 1024 }
  it('ett finger längst ner räknas inte (dockan i iPadOS)', () => {
    expect(inSystemEdge('touch', 600, 1010, screen)).toBe(true)
    expect(inSystemEdge('touch', 600, 1000, screen)).toBe(true)
    expect(inSystemEdge('touch', 600, 990, screen)).toBe(false)
  })
  it('ett finger vid vänster- eller högerkanten räknas inte (bakåt och framåt i Safari)', () => {
    expect(inSystemEdge('touch', 10, 500, screen)).toBe(true)
    expect(inSystemEdge('touch', 1350, 500, screen)).toBe(true)
    expect(inSystemEdge('touch', 40, 500, screen)).toBe(false)
    expect(inSystemEdge('touch', 1320, 500, screen)).toBe(false)
  })
  it('överkanten räknas som vanligt', () => {
    expect(inSystemEdge('touch', 600, 5, screen)).toBe(false)
  })
  it('pennan och musen räknas ända ut', () => {
    expect(inSystemEdge('pen', 600, 1020, screen)).toBe(false)
    expect(inSystemEdge('mouse', 5, 500, screen)).toBe(false)
  })
})

describe('isDoubleTap', () => {
  const a = { x: 100, y: 100, time: 1000 }
  it('räknar två snabba tryck på samma ställe', () => {
    expect(isDoubleTap(a, { x: 104, y: 98, time: 1300 }, 10)).toBe(true)
  })
  it('räknar inte för långsamma eller för långt isär', () => {
    expect(isDoubleTap(a, { x: 100, y: 100, time: 1400 }, 10)).toBe(false)
    expect(isDoubleTap(a, { x: 140, y: 100, time: 1100 }, 10)).toBe(false)
    expect(isDoubleTap(null, a, 10)).toBe(false)
  })
})

describe('fingerTap', () => {
  it('ångrar med två fingrar och gör om med tre', () => {
    expect(fingerTap(2, 150, 3)).toBe('undo')
    expect(fingerTap(3, 150, 3)).toBe('redo')
  })
  it('räknar inte en nypning eller ett långt tryck', () => {
    expect(fingerTap(2, 150, 40)).toBeNull()
    expect(fingerTap(2, 800, 0)).toBeNull()
    expect(fingerTap(1, 100, 0)).toBeNull()
  })
})

describe('panorering', () => {
  it('panorerar med mittknappen, och med vänsterknappen när mellanslag hålls nere', () => {
    expect(cameraButtons('select', 'camera').middle).toBe('truck')
    expect(cameraButtons('rect', 'camera', true).left).toBe('truck')
    expect(cameraButtons('select', 'camera').left).toBe('rotate')
  })
})

describe('snapPx', () => {
  it('är mer förlåtande med finger än med mus, och mest med Mät', () => {
    expect(snapPx('rect', 'touch')).toBeGreaterThan(snapPx('rect', 'mouse'))
    expect(snapPx('measure', 'touch')).toBeGreaterThan(snapPx('rect', 'touch'))
    expect(snapPx('measure', 'touch')).toBeGreaterThanOrEqual(44)
  })
})

describe('pickable', () => {
  it('pilen (utan id) går alltid att träffa; värden inte medan man väljer verktyg', () => {
    expect(pickable({}, undefined)).toBe(true)
    expect(pickable({}, 'ben')).toBe(true)
    expect(pickable({ id: 'ben' }, undefined)).toBe(true)
    expect(pickable({ id: 'ben' }, 'ben')).toBe(false)
    expect(pickable({ id: 'sarg' }, 'ben')).toBe(true)
  })
})

describe('afterTapStart', () => {
  const op = (kind: Op['kind']) => ({ kind }) as Op

  it('ett tryck på en pil eller båge väntar på ett mått, i stället för att följa musen', () => {
    expect(afterTapStart('handle', op('pushpull'))).toBe('wait')
    expect(afterTapStart('axis', op('move'))).toBe('wait')
    expect(afterTapStart('rotate', op('rotate'))).toBe('wait')
  })

  it('ett tryck på delen i Flytta/vrid startar ingen flytt', () => {
    expect(afterTapStart('body', op('move'))).toBe('drop')
  })

  it('en rektangel och push/pull med verktyget P följer musen till nästa klick', () => {
    expect(afterTapStart('ground', op('rect'))).toBe('follow')
    expect(afterTapStart('body', op('pushpull'))).toBe('follow')
  })
})

describe('penna', () => {
  it('när pennan använts styr fingrarna bara kameran; pennan och musen som förut', () => {
    expect(fingerOnlyCamera('touch', false)).toBe(false)
    expect(fingerOnlyCamera('touch', true)).toBe(true)
    expect(fingerOnlyCamera('pen', true)).toBe(false)
    expect(fingerOnlyCamera('mouse', true)).toBe(false)
  })

  it('pennan rör aldrig kameran när pennläget är på; fingrar och mus gör det', () => {
    expect(movesCamera('pen', true)).toBe(false)
    expect(movesCamera('pen', false)).toBe(true)
    expect(movesCamera('touch', true)).toBe(true)
    expect(movesCamera('mouse', true)).toBe(true)
  })

  it('en penna som svävar visar hover som musen, ett finger aldrig', () => {
    expect(hovers('pen', 0)).toBe(true)
    expect(hovers('mouse', 0)).toBe(true)
    expect(hovers('pen', 1)).toBe(false)
    expect(hovers('touch', 0)).toBe(false)
  })
})
