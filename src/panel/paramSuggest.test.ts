import { describe, expect, it } from 'vitest'
import { insertName, segments, suggestions, wordAt } from './paramSuggest'

const names = ['tjocklek', 'bredd', 'bänkhöjd', 'Tapp']

describe('förslag på parametrar', () => {
  it('hittar ordet vid markören, men inte ett tal', () => {
    expect(wordAt('bredd - tj', 10)).toEqual({ start: 8, end: 10, word: 'tj' })
    expect(wordAt('12', 2).word).toBe('')
    expect(wordAt('2 * brä', 7).word).toBe('brä')
  })

  it('föreslår namn som börjar likadant, oavsett stora och små bokstäver', () => {
    expect(suggestions(names, 't', 1)).toEqual(['tjocklek', 'Tapp'])
    expect(suggestions(names, 'b', 1)).toEqual(['bredd', 'bänkhöjd'])
    // Redan hela namnet: inget att föreslå.
    expect(suggestions(names, 'bredd', 5)).toEqual([])
  })

  it('föreslår alla efter en operator, inga i ett tomt fält eller efter ett tal', () => {
    expect(suggestions(names, '', 0)).toEqual([])
    expect(suggestions(names, 'bredd - ', 8)).toEqual(names)
    expect(suggestions(names, '(', 1)).toEqual(names)
    expect(suggestions(names, '12', 2)).toEqual([])
    expect(suggestions(names, 'bredd ', 6)).toEqual([])
  })

  it('föreslår inga direkt före ett tal eller i ett markerat fält, men ersätter det markerade', () => {
    // Markören först i "800": samma som sist, annars blir det "bredd800".
    expect(suggestions(names, '800', 0)).toEqual([])
    expect(suggestions(names, '2 * 800', 4)).toEqual([])
    // Hela talet markerat (som efter ett klick): som ett tomt fält, ingen lista.
    expect(suggestions(names, '800', 0, 3)).toEqual([])
    // Markerat efter en operator: det markerade räknas som borttaget.
    expect(suggestions(names, '2 * 800', 4, 7)).toEqual(names)
    expect(insertName('800', 0, 'bredd', 3)).toEqual({ text: 'bredd', caret: 5 })
    expect(insertName('2 * 800', 4, 'bredd', 7)).toEqual({ text: '2 * bredd', caret: 9 })
  })

  it('sätter in namnet i stället för ordet och flyttar markören efter det', () => {
    expect(insertName('bredd - tj', 10, 'tjocklek')).toEqual({ text: 'bredd - tjocklek', caret: 16 })
    expect(insertName('2 * ', 4, 'bredd')).toEqual({ text: '2 * bredd', caret: 9 })
    // Mitt i ett ord ersätts hela ordet.
    expect(insertName('tjx + 1', 1, 'tjocklek')).toEqual({ text: 'tjocklek + 1', caret: 8 })
  })

  it('delar upp ett uttryck i text och parameternamn', () => {
    expect(segments('bredd - 2 * tjocklek', new Set(names))).toEqual([
      { text: 'bredd', param: true },
      { text: ' - 2 * ', param: false },
      { text: 'tjocklek', param: true },
    ])
    expect(segments('okänd + 1', new Set(names))).toEqual([{ text: 'okänd + 1', param: false }])
  })
})
