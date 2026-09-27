import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHead } from './buildInfo'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)

function gitDir(files: Record<string, string>): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'bygg-git-')), '.git')
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true })
    writeFileSync(join(dir, name), text)
  }
  return dir
}

describe('readHead', () => {
  it('följer HEAD till grenens fil', () => {
    expect(readHead(gitDir({ HEAD: 'ref: refs/heads/main\n', 'refs/heads/main': `${A}\n` }))).toBe(A)
  })

  it('läser packed-refs när grenen inte har en egen fil', () => {
    const packed = `# pack-refs with: peeled fully-peeled sorted\n${B} refs/heads/other\n${A} refs/heads/main\n`
    expect(readHead(gitDir({ HEAD: 'ref: refs/heads/main\n', 'packed-refs': packed }))).toBe(A)
  })

  it('tar hashen direkt när HEAD inte pekar på en gren', () => {
    expect(readHead(gitDir({ HEAD: `${B}\n` }))).toBe(B)
  })

  it('null när .git saknas eller grenen inte finns', () => {
    expect(readHead(join(tmpdir(), 'finns-inte', '.git'))).toBeNull()
    expect(readHead(gitDir({ HEAD: 'ref: refs/heads/main\n' }))).toBeNull()
  })
})
