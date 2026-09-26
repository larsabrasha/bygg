import { describe, expect, it } from 'vitest'
import { numberFormat } from './numberFormat'

describe('numberFormat', () => {
  const fmt = numberFormat(1)

  it('visar aldrig -0', () => {
    expect(fmt.format(-0)).toBe('0')
    expect(fmt.format(-0.04)).toBe('0')
  })

  it('visar minus för negativa tal och decimalkomma', () => {
    expect(fmt.format(-15)).toBe('−15')
    expect(fmt.format(12.25)).toBe('12,3')
  })

  it('visar plus för en ändring, men inget tecken för noll', () => {
    const delta = numberFormat(1, false, true)
    expect(delta.format(134)).toBe('+134')
    expect(delta.format(-2.5)).toBe('−2,5')
    expect(delta.format(-0)).toBe('0')
    expect(delta.format(0.01)).toBe('0')
  })
})
