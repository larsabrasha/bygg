import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Vilken version som byggs: commit och om det fanns ändringar som inte var incheckade. */
export interface GitInfo {
  /** Hela hashen, eller null om den inte gick att ta reda på. */
  commit: string | null
  /** Ändringar som inte är incheckade (bara känt när git finns, som i dev och vid bygge lokalt). */
  dirty: boolean
}

const git = (root: string, ...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

/**
 * Commiten som byggs. Med git: hashen och om något är ändrat. Utan git (Docker-bygget:
 * node:alpine har inte git, och .dockerignore släpper bara in .git/HEAD och referenserna)
 * läses hashen ur filerna.
 */
export function gitInfo(root: string): GitInfo {
  try {
    return { commit: git(root, 'rev-parse', 'HEAD'), dirty: git(root, 'status', '--porcelain') !== '' }
  } catch {
    return { commit: readHead(join(root, '.git')), dirty: false }
  }
}

const HASH = /^[0-9a-f]{40}$/

/** Hashen som HEAD pekar på, ur .git utan git: HEAD, refs/heads/… eller packed-refs. */
export function readHead(gitDir: string): string | null {
  try {
    if (!statSync(gitDir).isDirectory()) return null
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim()
    if (HASH.test(head)) return head
    const ref = /^ref: (.+)$/.exec(head)?.[1]
    if (!ref) return null
    const loose = join(gitDir, ref)
    if (existsSync(loose)) {
      const hash = readFileSync(loose, 'utf8').trim()
      return HASH.test(hash) ? hash : null
    }
    const packed = join(gitDir, 'packed-refs')
    if (!existsSync(packed)) return null
    for (const line of readFileSync(packed, 'utf8').split('\n')) {
      const [hash, name] = line.trim().split(' ')
      if (name === ref && hash && HASH.test(hash)) return hash
    }
    return null
  } catch {
    return null
  }
}
