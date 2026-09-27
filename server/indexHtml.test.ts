import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { withAppUrl } from './indexHtml'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

describe('delningsbilden i index.html', () => {
  it('får en absolut adress från APP_URL', () => {
    expect(withAppUrl(html, 'https://bygg.example.se')).toContain(
      '<meta property="og:image" content="https://bygg.example.se/delningsbild.jpg"',
    )
  })

  it('också när APP_URL slutar med snedstreck', () => {
    expect(withAppUrl(html, 'https://bygg.example.se/')).toContain('content="https://bygg.example.se/delningsbild.jpg"')
  })

  it('står kvar relativ utan APP_URL', () => {
    expect(withAppUrl(html, undefined)).toBe(html)
    expect(html).toContain('<meta property="og:image" content="/delningsbild.jpg"')
  })
})
