import { describe, expect, it } from 'vitest'
import { evaluate, identifiers, isConstant, renameIdentifier } from './expr'

const scope: Record<string, number> = { tjocklek: 22, bredd: 600, höjd_ben: 700 }
const ev = (t: string) => evaluate(t, (n) => scope[n])

describe('evaluate', () => {
  it.each([
    ['22', 22],
    ['12,5', 12.5],
    ['450 mm', 450],
    ['450mm', 450],
    ['tjocklek', 22],
    ['bredd - 2 * tjocklek', 556],
    ['(bredd - 100) / 2', 250],
    ['-tjocklek', -22],
    ['höjd_ben + tjocklek', 722],
  ])('%j = %d', (text, value) => {
    expect(ev(text)).toEqual({ ok: true, value })
  })

  it.each([
    ['', 'Tomt'],
    ['okänd', 'Okänd parameter'],
    ['2 +', 'för tidigt'],
    ['(2 + 3', 'Saknar )'],
    ['2 3', 'Oväntat slut'],
    ['1 / 0', 'Division med noll'],
    ['2 # 3', 'Okänt tecken'],
  ])('avvisar %j', (text, error) => {
    const r = ev(text)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain(error)
  })
})

describe('identifiers och renameIdentifier', () => {
  it('hittar namn men inte enheten mm', () => {
    expect(identifiers('bredd - 2 * tjocklek + 5 mm')).toEqual(['bredd', 'tjocklek'])
    expect(isConstant('12,5 mm')).toBe(true)
  })

  it('byter bara hela namn', () => {
    expect(renameIdentifier('t + tjocklek * t', 't', 'x')).toBe('x + tjocklek * x')
  })
})
