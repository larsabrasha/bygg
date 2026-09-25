import { describe, expect, it } from 'vitest'
import { cameraButtons, fingerTap, isDoubleTap, pressOwner } from './gestures'

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
    expect(pressOwner('move', false, 'touch', 'body')).toBe('tool')
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
