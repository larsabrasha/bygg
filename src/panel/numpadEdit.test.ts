import { describe, expect, it } from 'vitest'
import { backspaceAt, insertAt, nameAt } from './numpadEdit'

describe('sifferblocket', () => {
  it('sätter in vid markören, eller byter ut det markerade', () => {
    expect(insertAt('12', 2, 2, '5')).toEqual({ text: '125', caret: 3 })
    expect(insertAt('450', 0, 3, '3')).toEqual({ text: '3', caret: 1 })
    expect(insertAt('bredd', 5, 5, ' - ')).toEqual({ text: 'bredd - ', caret: 8 })
  })

  it('raderar tecknet före markören, eller det markerade', () => {
    expect(backspaceAt('125', 3, 3)).toEqual({ text: '12', caret: 2 })
    expect(backspaceAt('125', 0, 3)).toEqual({ text: '', caret: 0 })
    expect(backspaceAt('125', 0, 0)).toEqual({ text: '125', caret: 0 })
  })
})

describe('namn från sifferblocket', () => {
  it('får mellanslag mot en siffra eller ett namn intill, inte mot ett räknesätt', () => {
    expect(nameAt('56', 2, 2, 'mått1').text).toBe('56 mått1')
    expect(nameAt('56 * ', 5, 5, 'mått1').text).toBe('56 * mått1')
    expect(nameAt('3', 0, 0, 'mått1')).toEqual({ text: 'mått1 3', caret: 6 })
    expect(nameAt('', 0, 0, 'mått1')).toEqual({ text: 'mått1', caret: 5 })
  })
})
