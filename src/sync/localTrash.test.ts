import { describe, expect, it } from 'vitest'
import { daysLeft, expired } from './localTrash'

describe('papperskorgen i webbläsaren', () => {
  const deletedAt = '2026-09-25T12:00:00.000Z'

  it('raderar efter 30 dagar, inte före', () => {
    expect(expired(deletedAt, new Date('2026-10-25T11:59:59Z'))).toBe(false)
    expect(expired(deletedAt, new Date('2026-10-25T12:00:00Z'))).toBe(true)
  })

  it('en tid som inte går att läsa räknas som gammal', () => {
    expect(expired('igår', new Date('2026-09-25T12:00:00Z'))).toBe(true)
  })

  it('räknar påbörjade dagar kvar', () => {
    expect(daysLeft(deletedAt, new Date('2026-09-25T12:00:00Z'))).toBe(30)
    expect(daysLeft(deletedAt, new Date('2026-09-26T11:59:59Z'))).toBe(30)
    expect(daysLeft(deletedAt, new Date('2026-09-26T12:00:00Z'))).toBe(29)
    expect(daysLeft(deletedAt, new Date('2026-10-25T11:00:00Z'))).toBe(1)
    expect(daysLeft(deletedAt, new Date('2026-11-25T12:00:00Z'))).toBe(0)
  })
})
