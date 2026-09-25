import { describe, expect, it } from 'vitest'
import { parseLength } from './measure'

describe('parseLength', () => {
  it.each([
    ['600', 600],
    ['  600 ', 600],
    ['12,5', 12.5],
    ['12.5', 12.5],
    ['-20', -20],
    ['450mm', 450],
    ['450 mm', 450],
    ['.5', 0.5],
  ])('tolkar %j som %d', (text, expected) => {
    expect(parseLength(text)).toBe(expected)
  })

  it.each(['', 'abc', '12,5,3', '1e3', '--2'])('avvisar %j', (text) => {
    expect(parseLength(text)).toBeNull()
  })
})
