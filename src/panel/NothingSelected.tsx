import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { EmptyState } from './EmptyState'
import { PushPullPicture } from './pictures'
import { dangerButton, quietDangerButton, secondaryButton } from './ui'

const ICON_SM = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

/** Genvägar med tangentbord (mus) eller gester (touch). */
const KEYS: [string, string][] = [
  ['R', 'Rektangel'],
  ['C', 'Cirkel'],
  ['P', 'Dra ut'],
  ['M', 'Flytta'],
  ['T', 'Mät'],
  ['⌘Z', 'Ångra'],
]
const GESTURES: [string, string][] = [
  ['Dubbeltryck på en del', 'Flytta och vrid'],
  ['Tryck med två fingrar', 'Ångra'],
  ['Tryck med tre fingrar', 'Gör om'],
]

function Hints({ items, className }: { items: [string, string][]; className: string }) {
  return (
    <dl className={`grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-[13px] ${className}`}>
      {items.map(([key, what]) => (
        <div key={key} className="contents">
          <dt>
            <kbd className="inline-block min-w-6 rounded-md bg-button px-1.5 py-0.5 text-center font-sans text-xs text-ink">
              {key}
            </kbd>
          </dt>
          <dd className="text-muted">{what}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Rensa modellen, med en fråga först: knappen byts mot Rensa och Avbryt på samma plats. */
function ClearModel() {
  const clearDocument = useDocumentStore((s) => s.clearDocument)
  const [asking, setAsking] = useState(false)
  if (!asking)
    return (
      <button className={`${quietDangerButton} mt-auto self-start`} onClick={() => setAsking(true)}>
        <Trash2 {...ICON_SM} />
        Rensa modellen
      </button>
    )
  return (
    <div className="mt-auto flex flex-col gap-2" role="group" aria-label="Rensa modellen">
      <p className="text-[13px] text-ink">Ta bort alla delar och skisser? Du kan ångra efteråt.</p>
      <div className="flex gap-2">
        <button
          className={dangerButton}
          onClick={() => {
            setAsking(false)
            clearDocument()
          }}
        >
          <Trash2 {...ICON_SM} />
          Rensa
        </button>
        <button className={secondaryButton} onClick={() => setAsking(false)} autoFocus>
          Avbryt
        </button>
      </div>
    </div>
  )
}

/** Egenskaper när inget är valt: vad man kan göra, och Rensa modellen längst ner. */
export function NothingSelected({ isEmpty }: { isEmpty: boolean }) {
  return (
    <div className="flex flex-1 flex-col gap-5">
      <EmptyState picture={<PushPullPicture />} title={isEmpty ? 'Börja med en skiss' : 'Inget valt'}>
        {isEmpty
          ? 'Rita en rektangel eller en cirkel på golvet, och dra ut den till en del med pilen.'
          : 'Tryck på en del eller en skiss för att se och ändra dess mått.'}
      </EmptyState>
      <Hints items={KEYS} className="self-center pointer-coarse:hidden" />
      <Hints items={GESTURES} className="hidden self-center pointer-coarse:grid" />
      {!isEmpty && <ClearModel />}
    </div>
  )
}
