import { Presentation, ScrollText } from 'lucide-react'
import type { ReactNode } from 'react'
import { GitHubMark, REPO_URL } from './GitHubMark'
import { Logo } from './Logo'

const COMMIT = import.meta.env.BUILD_COMMIT
/** Sidan med licenserna, som bygget lägger bredvid index.html (scripts/attributions.ts). */
const LICENSES_URL = `${import.meta.env.BASE_URL}licenser.html`
/** Startsidan, också för den som är inloggad (se main.tsx). */
const INTRO_URL = `${import.meta.env.BASE_URL}intro`

/** Om Bygg, sista sidan i Inställningar: vilken version som körs, och länkar ut (licenserna i en ny flik). */
export function About() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 pt-4 text-sm">
      <Logo height={40} />
      <dl className="grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg bg-canvas p-3">
        <Row label="Version">
          <Commit />
        </Row>
      </dl>
      <p className="text-center text-muted">
        Idéer, design och finsnickeri: Lars Arvidsson.
        <br />
        Koden hyvlad av Claude, tills Lars var nöjd.
      </p>
      {/* Länkar ut ur appen, inte åtgärder: en lätt rad, som i en Om-ruta på macOS. Startsidan öppnas i
            samma flik, så att appen inte är öppen i två (där leder "Öppna Bygg" tillbaka); resten i nya flikar. */}
      <nav
        aria-label="Länkar"
        className="flex w-full flex-wrap justify-center gap-x-2 gap-y-1 border-t border-line pt-3"
      >
        <a href={INTRO_URL} className={outLink}>
          <Presentation size={16} strokeWidth={1.75} aria-hidden />
          Intro
        </a>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className={outLink}>
          <GitHubMark />
          GitHub
        </a>
        <a href={LICENSES_URL} target="_blank" rel="noreferrer" className={outLink}>
          <ScrollText size={16} strokeWidth={1.75} aria-hidden />
          Licenser
        </a>
      </nav>
    </div>
  )
}

/** En länk i raden längst ner: som text, med en yta som är lätt att träffa med fingret. */
const outLink =
  'inline-flex h-9 items-center gap-1.5 rounded-md px-2 whitespace-nowrap text-accent hover:bg-hover narrow:h-11'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  )
}

/** Commiten, kort och som länk till GitHub. */
function Commit() {
  if (!COMMIT) return <span>okänd</span>
  const dirty = import.meta.env.BUILD_DIRTY
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <a
        href={`${REPO_URL}/commit/${COMMIT}`}
        target="_blank"
        rel="noreferrer"
        className="font-mono hover:underline"
        title="Commiten på GitHub"
      >
        {COMMIT.slice(0, 7)}
      </a>
      {dirty && (
        <span className="text-warn" title="Ändringar som inte är incheckade">
          + lokala ändringar
        </span>
      )}
    </span>
  )
}
