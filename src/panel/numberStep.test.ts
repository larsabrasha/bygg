import { describe, expect, it } from 'vitest'
import { arrowStep, plainNumber, stepText } from './numberStep'

describe('steg med piltangenter', () => {
  it('läser rena tal, men inte uttryck', () => {
    expect(plainNumber('800')).toBe(800)
    expect(plainNumber(' 455,5 ')).toBe(455.5)
    expect(plainNumber('−300')).toBe(-300)
    expect(plainNumber('-0.5')).toBe(-0.5)
    expect(plainNumber('mått1')).toBeNull()
    expect(plainNumber('2 * 3')).toBeNull()
    expect(plainNumber('')).toBeNull()
  })

  it('1, med Shift 10, med Alt 0,1', () => {
    expect(arrowStep({ key: 'ArrowUp', shiftKey: false, altKey: false })).toBe(1)
    expect(arrowStep({ key: 'ArrowDown', shiftKey: true, altKey: false })).toBe(-10)
    expect(arrowStep({ key: 'ArrowUp', shiftKey: false, altKey: true })).toBe(0.1)
    expect(arrowStep({ key: 'Enter', shiftKey: false, altKey: false })).toBeNull()
  })

  it('skriver resultatet som fälten gör, utan flyttalsfel och utan −0', () => {
    expect(stepText('800', 1)).toBe('801')
    expect(stepText('0,2', 0.1)).toBe('0,3')
    expect(stepText('5', -10)).toBe('−5')
    expect(stepText('0,1', -0.1)).toBe('0')
    expect(stepText('bredd', 1)).toBeNull()
  })
})
