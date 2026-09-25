import { describe, expect, it } from 'vitest'
import { pickScore } from './pickPriority'

const winner = (hits: [{ kind: string; tool?: unknown; headOn?: boolean }, number][]) =>
  hits.reduce((a, b) => (pickScore(b[0], b[1]) < pickScore(a[0], a[1]) ? b : a))[0]

describe('pickScore', () => {
  it('låter en flyttpil vinna över en båge, också när bågen är närmare', () => {
    expect(
      winner([
        [{ kind: 'rotate' }, 100],
        [{ kind: 'axis' }, 300],
      ]).kind,
    ).toBe('axis')
  })

  it('låter bågen vinna över en pil som pekar rakt mot kameran', () => {
    expect(
      winner([
        [{ kind: 'axis', headOn: true }, 100],
        [{ kind: 'rotate' }, 300],
      ]).kind,
    ).toBe('rotate')
  })

  it('låter pilar och bågar vinna över en del framför dem', () => {
    expect(
      winner([
        [{ kind: 'body' }, 10],
        [{ kind: 'rotate' }, 5000],
      ]).kind,
    ).toBe('rotate')
  })

  it('tar närmaste del, och en skiss före ytan den ligger på', () => {
    expect(
      winner([
        [{ kind: 'body' }, 200],
        [{ kind: 'body' }, 100],
      ]),
    ).toEqual({ kind: 'body' })
    expect(
      winner([
        [{ kind: 'body' }, 100],
        [{ kind: 'sketch' }, 100.5],
      ]).kind,
    ).toBe('sketch')
  })
})
