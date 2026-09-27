import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { WOOD_SOURCES } from '../src/scene/woodSources'

/** Paketets katalog för en modul i node_modules (med @scope), eller null för appens egen kod. */
export function packageDirOf(id: string): string | null {
  const path = id.replace(/^\0/, '').split('?')[0]!.replaceAll('\\', '/')
  const marker = '/node_modules/'
  const i = path.lastIndexOf(marker)
  if (i < 0) return null
  const parts = path.slice(i + marker.length).split('/')
  const name = parts[0]?.startsWith('@') ? parts.slice(0, 2) : parts.slice(0, 1)
  if (name.length === 0 || name.some((p) => !p)) return null
  return path.slice(0, i + marker.length) + name.join('/')
}

/** Webbadressen till ett förråd som det står i package.json (git+https, git://, github:…). */
export function repoUrl(repository: unknown): string | undefined {
  const raw = typeof repository === 'string' ? repository : (repository as { url?: string } | undefined)?.url
  if (!raw) return undefined
  const short = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(raw)
  if (short) return `https://github.com/${short[1]}`
  return raw
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/\.git$/, '')
}

/** Licensen som text: "MIT", eller flera (gamla "licenses") ihop. */
export function licenseName(pkg: { license?: unknown; licenses?: unknown }): string {
  const one = (l: unknown) => {
    const name = typeof l === 'string' ? l : ((l as { type?: string } | undefined)?.type ?? '')
    // npm:s sätt att säga att licensen står i en fil: den står i texten under.
    return /^SEE LICENSE IN /i.test(name) ? 'Egen licens, se texten' : name
  }
  if (pkg.license) return one(pkg.license) || 'okänd'
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map(one).filter(Boolean).join(' OR ') || 'okänd'
  return 'okänd'
}

/** Ett paket från npm som finns i bygget, med licens och licenstext (LICENSE, NOTICE). */
export interface Attribution {
  name: string
  version: string
  license: string
  author?: string
  url?: string
  text?: string
}

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.|-|$)/i

function readPackage(dir: string): Attribution | null {
  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
  if (typeof pkg.name !== 'string') return null
  const author = typeof pkg.author === 'string' ? pkg.author : (pkg.author as { name?: string } | undefined)?.name
  const url = (typeof pkg.homepage === 'string' ? pkg.homepage : undefined) ?? repoUrl(pkg.repository)
  // LICENSE och NOTICE (Apache-licensen kräver att NOTICE följer med).
  const text = readdirSync(dir)
    .filter((f) => LICENSE_FILE.test(f))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8').trim())
    .join('\n\n')
  return {
    name: pkg.name,
    version: typeof pkg.version === 'string' ? pkg.version : '',
    license: licenseName(pkg),
    ...(author && { author }),
    ...(url && { url }),
    ...(text && { text }),
  }
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const link = (href: string, text: string) => `<a href="${esc(href)}" target="_blank" rel="noreferrer">${esc(text)}</a>`

/** Trätexturernas foton, en gång var (flera träslag delar foto). */
const TEXTURES = [...new Set(Object.values(WOOD_SOURCES).map((s) => s.id))].sort()

/**
 * Sidan med licenserna: fristående HTML (inget av appen behöver laddas), med appens färger
 * och mörkt tema. version: vad som står längst ner, t.ex. commit och när den byggdes.
 */
export function licensesPage(packages: readonly Attribution[], version: string): string {
  const items = packages
    .map((p) => {
      const meta = [p.author && esc(p.author), p.url && link(p.url, p.url.replace(/^https?:\/\//, ''))].filter(Boolean)
      return `<li><details><summary><span class="name">${esc(p.name)} <span class="faint">${esc(p.version)}</span></span><span class="lic">${esc(p.license)}</span></summary>${
        meta.length ? `<p class="muted small">${meta.join(' · ')}</p>` : ''
      }${
        p.text
          ? `<pre>${esc(p.text)}</pre>`
          : '<p class="muted small">Paketet har ingen licenstext med sig, bara namnet på licensen.</p>'
      }</details></li>`
    })
    .join('\n')
  const textures = TEXTURES.map((id) => link(`https://polyhaven.com/a/${id}`, id)).join(', ')
  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>Licenser och tack – Bygg</title>
<link rel="icon" href="/icon.svg" type="image/svg+xml" />
<style>
  :root { --canvas: #f2f1ee; --panel: #fbfaf8; --ink: #2a2724; --muted: #6b655c; --faint: #8a847a; --line: #d8d4cc; --accent: #1e6fd9; }
  @media (prefers-color-scheme: dark) {
    :root { --canvas: #1b1a18; --panel: #24221f; --ink: #ebe7e0; --muted: #a8a196; --faint: #8a8378; --line: #3b3833; --accent: #6aa5f5; }
  }
  body { margin: 0; background: var(--canvas); color: var(--ink); font: 14px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 16px max(32px, env(safe-area-inset-bottom)); }
  h1 { font-size: 22px; margin: 0 0 6px; }
  h2 { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--faint); margin: 28px 0 8px; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .muted { color: var(--muted); }
  .faint { color: var(--faint); }
  .small { font-size: 12px; }
  ul { list-style: none; margin: 0; padding: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; }
  li + li { border-top: 1px solid var(--line); }
  summary { display: flex; gap: 12px; align-items: baseline; padding: 8px 12px; cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary::before { content: '›'; color: var(--faint); transition: transform 0.15s; display: inline-block; }
  details[open] summary::before { transform: rotate(90deg); }
  .name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .lic { color: var(--muted); font-size: 12px; text-align: right; }
  details > p, details > pre { margin: 0 12px 12px; }
  pre { max-height: 20rem; overflow: auto; padding: 8px; border-radius: 6px; background: var(--canvas); font-size: 11px; line-height: 1.4; white-space: pre-wrap; }
  footer { margin-top: 28px; }
</style>
</head>
<body>
<main>
<h1>Licenser och tack</h1>
<p class="muted">Bygg bygger på fria bibliotek, foton och typsnitt. Tack till alla som gjort dem.</p>
<h2>Foton och typsnitt</h2>
<p>Trätexturerna är foton från ${link('https://polyhaven.com', 'Poly Haven')} (CC0, fria att använda): ${textures}.</p>
<p>Loggan är ritad efter typsnittet ${link('https://fonts.google.com/specimen/Berkshire+Swash', 'Berkshire Swash')} av Astigmatic (${link('https://openfontlicense.org', 'SIL Open Font License 1.1')}).</p>
<h2>Programvara · ${packages.length} paket</h2>
<ul>
${items}
</ul>
<footer class="muted small">${esc(version)}</footer>
</main>
</body>
</html>
`
}

/** Adressen till sidan med licenserna (bredvid index.html). */
export const LICENSES_FILE = 'licenser.html'

/**
 * Licenserna för allt från npm som hamnar i bygget, som en egen sida (LICENSES_FILE) som
 * Om Bygg länkar till. Räknas ur modulerna i varje fil som byggs, också Web Workers (samma
 * plugin i worker.plugins; de byggs före appen, så att de hunnit bli klara).
 * I dev finns inget bygge att räkna ur; där säger sidan det.
 */
export function attributions(version: string): { app: Plugin; worker: () => Plugin } {
  const dirs = new Set<string>()
  const collect = (bundle: Record<string, { type: string; moduleIds?: readonly string[] }>) => {
    for (const out of Object.values(bundle)) {
      if (out.type !== 'chunk') continue
      for (const id of out.moduleIds ?? []) {
        const dir = packageDirOf(id)
        if (dir) dirs.add(dir)
      }
    }
  }
  return {
    worker: () => ({ name: 'attributions-worker', apply: 'build', generateBundle: (_, bundle) => collect(bundle) }),
    app: {
      name: 'attributions',
      configureServer(server) {
        server.middlewares.use(`/${LICENSES_FILE}`, (_req, res) => {
          res.setHeader('content-type', 'text/html; charset=utf-8')
          res.end(licensesPage([], 'I dev finns ingen lista: den räknas fram när appen byggs (npm run build).'))
        })
      },
      generateBundle(_, bundle) {
        collect(bundle)
        const seen = new Set<string>()
        const packages: Attribution[] = []
        for (const dir of [...dirs].sort()) {
          const a = readPackage(dir)
          if (!a || seen.has(`${a.name}@${a.version}`)) continue
          seen.add(`${a.name}@${a.version}`)
          packages.push(a)
        }
        packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
        this.emitFile({ type: 'asset', fileName: LICENSES_FILE, source: licensesPage(packages, version) })
      },
    },
  }
}
