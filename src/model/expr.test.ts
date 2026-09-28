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
    ['12cm', 120],
    ['12,5 cm', 125],
    ['1,2 m', 1200],
    ['bredd - 2 cm', 580],
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
    ['2 3', 'Något saknas före "3"'],
    ['bredd tjocklek', 'Något saknas före "tjocklek"'],
    ['12 tum', 'Något saknas före "tum"'],
    ['1 / 0', 'Division med noll'],
    ['2 # 3', 'Okänt tecken'],
  ])('avvisar %j', (text, error) => {
    const r = ev(text)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain(error)
  })
})

describe('identifiers och renameIdentifier', () => {
  it('läser det typografiska minustecknet (U+2212) som minus', () => {
    expect(evaluate('\u2212120', () => undefined)).toEqual({ ok: true, value: -120 })
    expect(evaluate('10 \u2212 2,5', () => undefined)).toEqual({ ok: true, value: 7.5 })
  })

  it('hittar namn men inte enheterna', () => {
    expect(identifiers('bredd - 2 * tjocklek + 5 mm + 2 cm')).toEqual(['bredd', 'tjocklek'])
    expect(isConstant('1,2 m')).toBe(true)
    expect(isConstant('12,5 mm')).toBe(true)
  })

  it('byter bara hela namn', () => {
    expect(renameIdentifier('t + tjocklek * t', 't', 'x')).toBe('x + tjocklek * x')
  })
})
