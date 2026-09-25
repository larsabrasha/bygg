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
})
