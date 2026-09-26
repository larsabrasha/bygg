import { describe, expect, it } from 'vitest'
import { conflictName } from '../sync/engine'
import { splitConflict } from './modelName'

describe('splitConflict', () => {
  it('känner igen namnet som synken ger en konfliktkopia', () => {
    const name = conflictName('Min modell', new Date(2026, 8, 25, 3, 34))
    expect(splitConflict(name)).toEqual({ base: 'Min modell', when: '2026-09-25 03:34' })
  })
  it('lämnar vanliga namn, även med parentes', () => {
    expect(splitConflict('Bokhylla (ek)')).toBeNull()
  })
})
