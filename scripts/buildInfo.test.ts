import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gitInfo, newestVersion, readHead, tagsAt } from './buildInfo'

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

describe('versionen', () => {
  it('den högsta versionstaggen, utan v; andra taggar räknas inte', () => {
    expect(newestVersion(['v0.3.1', 'v0.10.0', 'v0.4.0', 'prov'])).toBe('0.10.0')
    expect(newestVersion(['prov', 'v1.2'])).toBeNull()
  })

  it('taggarna på commiten ur .git utan git: egna filer och packed-refs, också annoterade', () => {
    const T = 'c'.repeat(40)
    const packed = `# pack-refs with: peeled fully-peeled sorted\n${B} refs/tags/v0.1.0\n${T} refs/tags/v0.2.0\n^${A}\n`
    const dir = gitDir({
      HEAD: `${A}\n`,
      'refs/tags/v0.3.0': `${A}\n`,
      'refs/tags/gammal': `${B}\n`,
      'packed-refs': packed,
    })
    expect(tagsAt(dir, A).sort()).toEqual(['v0.2.0', 'v0.3.0'])
  })

  it('BUILD_VERSION från arbetsflödet vinner över taggarna', () => {
    const dir = gitDir({ HEAD: `${A}\n`, 'refs/tags/v0.3.0': `${A}\n` })
    // Katalogen är inget git-förråd, så filerna läses som i Docker-bygget.
    const root = join(dir, '..')
    expect(gitInfo(root, {}).version).toBe('0.3.0')
    expect(gitInfo(root, { BUILD_VERSION: 'v0.4.0' }).version).toBe('0.4.0')
    expect(gitInfo(root, { BUILD_VERSION: '' }).version).toBe('0.3.0')
  })
})
