import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Vilken version som byggs: commit och om det fanns ändringar som inte var incheckade. */
export interface GitInfo {
  /** Hela hashen, eller null om den inte gick att ta reda på. */
  commit: string | null
  /** Ändringar som inte är incheckade (bara känt när git finns, som i dev och vid bygge lokalt). */
  dirty: boolean
  /** Versionen ("0.4.0") om en versionstagg (v0.4.0) pekar på commiten, annars null. */
  version: string | null
}

const VERSION_TAG = /^v(\d+)\.(\d+)\.(\d+)$/

/** Den högsta versionen bland taggarna, utan v: v0.4.0 och v0.3.1 ger "0.4.0". Null om ingen är en version. */
export function newestVersion(tags: readonly string[]): string | null {
  const versions = tags.flatMap((t) => {
    const m = VERSION_TAG.exec(t.trim())
    return m ? [[Number(m[1]), Number(m[2]), Number(m[3])] as const] : []
  })
  versions.sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])
  return versions[0]?.join('.') ?? null
}

const git = (root: string, ...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

/**
 * Commiten som byggs. Med git: hashen, om något är ändrat och taggarna på commiten. Utan git
 * (Docker-bygget: node:alpine har inte git, och .dockerignore släpper bara in .git/HEAD och
 * referenserna) läses hashen och taggarna ur filerna. BUILD_VERSION i miljön vinner över
 * taggarna: arbetsflödet som bygger avbilden sätter den till taggen det körs för.
 */
export function gitInfo(root: string, env: NodeJS.ProcessEnv = process.env): GitInfo {
  const fromEnv = env.BUILD_VERSION ? newestVersion([env.BUILD_VERSION]) : null
  try {
    const commit = git(root, 'rev-parse', 'HEAD')
    const dirty = git(root, 'status', '--porcelain') !== ''
    return { commit, dirty, version: fromEnv ?? newestVersion(git(root, 'tag', '--points-at', 'HEAD').split('\n')) }
  } catch {
    const gitDir = join(root, '.git')
    const commit = readHead(gitDir)
    return { commit, dirty: false, version: fromEnv ?? (commit ? newestVersion(tagsAt(gitDir, commit)) : null) }
  }
}

/**
 * Taggarna som pekar på commiten, ur .git utan git: en fil per tagg i refs/tags, och i
 * packed-refs. En lätt tagg (git tag v1.2.3) pekar direkt på commiten. En annoterad pekar på ett
 * taggobjekt; i packed-refs står commiten då på raden efter, med ^ först.
 */
export function tagsAt(gitDir: string, commit: string): string[] {
  const tags: string[] = []
  const walk = (dir: string, prefix: string) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const file = join(dir, name)
      if (statSync(file).isDirectory()) walk(file, `${prefix}${name}/`)
      else if (readFileSync(file, 'utf8').trim() === commit) tags.push(prefix + name)
    }
  }
  try {
    walk(join(gitDir, 'refs', 'tags'), '')
    const packed = join(gitDir, 'packed-refs')
    if (existsSync(packed)) {
      let last: string | null = null
      for (const line of readFileSync(packed, 'utf8').split('\n')) {
        const t = line.trim()
        if (t.startsWith('^')) {
          if (last && t.slice(1) === commit) tags.push(last)
          continue
        }
        const [hash, ref] = t.split(' ')
        last = ref?.startsWith('refs/tags/') ? ref.slice('refs/tags/'.length) : null
        if (last && hash === commit) tags.push(last)
      }
    }
  } catch {
    // Går de inte att läsa visas bara commiten.
  }
  return [...new Set(tags)]
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
