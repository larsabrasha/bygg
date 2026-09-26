import { describe, expect, it } from 'vitest'
import { parsePath, pathFor } from './route'

describe('route', () => {
  it('startsidan är /', () => {
    expect(pathFor('gallery', 'abc', false)).toBe('/')
    expect(pathFor('gallery', 'abc', true)).toBe('/')
    expect(parsePath('/')).toEqual({ screen: 'gallery' })
    expect(parsePath('')).toEqual({ screen: 'gallery' })
  })

  it('en modell är /{id}', () => {
    expect(pathFor('model', 'abc-123', false)).toBe('/abc-123')
    expect(parsePath('/abc-123')).toEqual({ screen: 'model', id: 'abc-123', drawing: false })
    expect(parsePath('/abc-123/')).toEqual({ screen: 'model', id: 'abc-123', drawing: false })
  })

  it('ritningen är /{id}/ritning', () => {
    expect(pathFor('model', 'abc-123', true)).toBe('/abc-123/ritning')
    expect(parsePath('/abc-123/ritning')).toEqual({ screen: 'model', id: 'abc-123', drawing: true })
  })

  it('går fram och tillbaka', () => {
    expect(parsePath(pathFor('model', 'a b', true))).toEqual({ screen: 'model', id: 'a b', drawing: true })
  })

  it('okända sökvägar går till startsidan', () => {
    expect(parsePath('/a/b')).toEqual({ screen: 'gallery' })
    expect(parsePath('/a/ritning/b')).toEqual({ screen: 'gallery' })
  })

  it('trasig kodning går till startsidan', () => {
    expect(parsePath('/%E0%A4%A')).toEqual({ screen: 'gallery' })
  })

  it('modell utan id går till startsidan', () => {
    expect(pathFor('model', null, true)).toBe('/')
  })
})
