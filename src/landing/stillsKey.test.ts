import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { VIEWS } from './models'
import { stillsKey } from './stillsKey'

describe('stillbilderna på startsidan', () => {
  it('är tagna av möblerna som de ser ut nu (annars: npm run stills)', () => {
    const saved = JSON.parse(readFileSync(new URL('./stills/stills.json', import.meta.url), 'utf8')) as { key: string }
    expect(saved.key, 'Möblerna på startsidan har ändrats: ta om bilderna med npm run stills.').toBe(stillsKey(VIEWS))
  })
})
