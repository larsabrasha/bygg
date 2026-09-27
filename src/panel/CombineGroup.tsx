import type { LucideIcon } from 'lucide-react'
import { ChevronRight, Puzzle, SquaresSubtract, SquaresUnite, Trash2, Unlink } from 'lucide-react'
import { jointTwins } from '../model/combine'
import { instanceCounts, resolveBodies } from '../model/resolve'
import type { Body } from '../model/types'
import { useDocumentStore } from '../store/documentStore'
import { useViewStore } from '../store/viewStore'
import { Group } from './Group'
import { Tip } from './Tip'
import { KIND_TITLES, kindOf, toolRows, type Kind } from './toolRows'
import { quietDangerButton, secondaryButton } from './ui'

const ICON_SM = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

const ICONS: Record<Kind, LucideIcon> = {
  tapp: Puzzle,
  tapphål: Puzzle,
  urtag: SquaresSubtract,
  tillägg: SquaresUnite,
}

/** Ikonen i en ljus ruta, som visar vad raden är. */
const KindIcon = ({ Icon }: { Icon: LucideIcon }) => (
  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent-soft text-accent">
    <Icon {...ICON_SM} />
  </span>
)

/**
 * På en vanlig del: dess tappar, urtag och tillägg, och tapphålen från andra delars tappar.
 * En rad väljer verktyget; med musen lyser det (alla på raden) upp i 3D-vyn medan man pekar på raden.
 * Nya gör man med Tapp och Forma i raden överst i vyn; här syns bara det som finns.
 */
export function HostTools({ body }: { body: Body }) {
  const doc = useDocumentStore((s) => s.doc)
  const select = useDocumentStore((s) => s.select)
  const setPeek = useViewStore((s) => s.setPeekTools)
  const rows = toolRows(resolveBodies(doc), body.id)

  if (rows.length === 0) return null
  return (
    <Group title="Urtag och tillägg">
      <ul className="-mx-2 flex flex-col" onPointerLeave={() => setPeek(null)}>
        {rows.map(({ ids, kind, title, detail }) => (
          <li key={ids[0]}>
            <button
              className="flex min-h-12 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-hover"
              onPointerEnter={(e) => e.pointerType === 'mouse' && setPeek(ids)}
              onClick={() => {
                setPeek(null)
                select({ kind: 'body', id: ids[0]! })
              }}
            >
              <KindIcon Icon={ICONS[kind]} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-semibold">{title}</span>
                <span className="truncate text-xs text-muted tabular-nums">{detail}</span>
              </span>
              <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-faint" />
            </button>
          </li>
        ))}
      </ul>
    </Group>
  )
}

/** En del som verktyget sitter på, som en knapp som väljer den. */
function PartChip({ id, name }: { id: string; name: string }) {
  const select = useDocumentStore((s) => s.select)
  return (
    <button
      className="inline-flex h-8 max-w-full min-w-0 cursor-pointer items-center gap-0.5 rounded-md bg-button pr-1.5 pl-2.5 text-[13px] font-semibold hover:bg-hover narrow:h-10"
      onClick={() => select({ kind: 'body', id })}
    >
      <span className="truncate">{name}</span>
      <ChevronRight size={14} strokeWidth={2} aria-hidden className="shrink-0 text-faint" />
    </button>
  )
}

/**
 * På ett verktyg, överst: vad det är och vilka delar det formar (tryck för att gå dit),
 * och Lossa och Ta bort. Kopiorna nämns bara när det finns några.
 */
export function ToolCard({ body }: { body: Body }) {
  const doc = useDocumentStore((s) => s.doc)
  const detach = useDocumentStore((s) => s.detach)
  const deleteSelection = useDocumentStore((s) => s.deleteSelection)
  const tool = body.tool!
  const bodies = resolveBodies(doc)
  const host = bodies.find((b) => b.id === tool.host)
  const into = tool.into ? bodies.find((b) => b.id === tool.into) : undefined
  if (!host) return null
  const counts = instanceCounts(doc)
  const copies = (b: Body) => (counts.get(b.defId) ?? 0) > 1
  const kind = kindOf(tool, host.id)
  const title = KIND_TITLES[kind].one
  const Icon = ICONS[kind]

  const rows: [string, Body][] =
    tool.op === 'joint'
      ? [['Sitter på', host], ...(into ? ([['Tapphål i', into]] as [string, Body][]) : [])]
      : [[tool.op === 'subtract' ? 'Skärs ut ur' : 'Sitter på', host]]

  const the = { tapp: 'Tappen', tapphål: 'Tappen', urtag: 'Urtaget', tillägg: 'Tillägget' }[kind]
  const twins = jointTwins(doc, body.id).length
  const note = [
    twins > 0
      ? `En av ${twins + 1} likadana tappar, en från varje ${host.name}. De hör ihop: det du gör med den här görs med alla.`
      : copies(host) && `${the} finns ${kind === 'urtag' ? 'i' : 'på'} alla länkade kopior av ${host.name}.`,
    into && copies(into) && `Tapphålet finns bara i den här ${into.name}, inte i dess kopior.`,
    `Flytta eller ändra ${the.toLowerCase()}, så följer resultatet med.`,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Group title={title}>
      <div className="flex items-center gap-2.5">
        <KindIcon Icon={Icon} />
        <dl className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
          {rows.map(([label, b]) => (
            <div key={label} className="contents">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="min-w-0">
                <PartChip id={b.id} name={b.name} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="text-xs text-faint">{note}</p>
      <div className="grid grid-cols-2 gap-2">
        <Tip label="Gör den till en vanlig del igen, där den står">
          <button className={secondaryButton} onClick={() => detach(body.id)}>
            <Unlink {...ICON_SM} />
            Lossa
          </button>
        </Tip>
        <button className={quietDangerButton} onClick={deleteSelection}>
          <Trash2 {...ICON_SM} />
          Ta bort
        </button>
      </div>
    </Group>
  )
}
