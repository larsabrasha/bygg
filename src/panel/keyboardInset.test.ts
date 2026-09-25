import { describe, expect, it } from 'vitest'
import { KEYBOARD_MIN, keyboardInset } from './keyboardInset'

describe('keyboardInset', () => {
  it('är tangentbordets höjd när det täcker skärmen', () => {
    expect(keyboardInset(812, 476)).toBe(336)
  })

  it('är 0 utan tangentbord, och för små skillnader som adressfältet', () => {
    expect(keyboardInset(812, 812)).toBe(0)
    expect(keyboardInset(812, 812 - KEYBOARD_MIN + 1)).toBe(0)
  })
})
