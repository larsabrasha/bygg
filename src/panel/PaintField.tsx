import { PaintBucket, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { PartDef } from '../model/types'
import { useDocumentStore } from '../store/documentStore'
import { CommitField } from './CommitField'
import { fieldLabel, iconAction, secondaryButton } from './ui'
import { Tip } from './Tip'

/** En varmvit, vanlig på montrar: färgen en del får när man börjar måla den. */
const FIRST_COLOR = '#f1efe9'

const ICON_SM = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

/**
 * Färgen delen målas i: en färgruta och koden man beställer efter (fri text,
 * t.ex. "NCS S 0502-Y"). Gäller formen, alltså alla länkade kopior.
 */
export function PaintField({ instanceId, def }: { instanceId: string; def: PartDef }) {
  const updatePart = useDocumentStore((s) => s.updatePart)
  const paint = def.paint
  const picker = useRef<HTMLInputElement>(null)

  // Färgväljaren sparar först när den stängs (change), inte vid varje steg (input):
  // annars blir varje drag i färgfältet ett eget ångra-steg.
  useEffect(() => {
    const el = picker.current
    if (!el || !paint) return
    const onChange = () => {
      if (el.value !== paint.color) updatePart(instanceId, { paint: { ...paint, color: el.value } })
    }
    el.addEventListener('change', onChange)
    return () => el.removeEventListener('change', onChange)
  }, [instanceId, paint, updatePart])

  if (!paint) {
    return (
      <button
        className={`${secondaryButton} w-full`}
        onClick={() => updatePart(instanceId, { paint: { color: FIRST_COLOR } })}
      >
        <PaintBucket {...ICON_SM} />
        Måla delen
      </button>
    )
  }

  return (
    <div className={fieldLabel}>
      Målas i
      <div className="flex items-center gap-2">
        <input
          ref={picker}
          type="color"
          aria-label="Färg"
          // Okontrollerad: den visar färgen medan man väljer, och sparas vid change (ovan).
          key={paint.color}
          defaultValue={paint.color}
          className="size-10 shrink-0 cursor-pointer rounded-lg border border-line bg-field p-1 narrow:size-11"
        />
        <div className="min-w-0 flex-1">
          <CommitField
            key={def.id}
            label="Färgkod"
            placeholder="t.ex. NCS S 0502-Y"
            value={paint.code ?? ''}
            onCommit={(t) => {
              const code = t.trim()
              updatePart(instanceId, { paint: { color: paint.color, ...(code && { code }) } })
              return null
            }}
          />
        </div>
        <Tip label="Ta bort färgen">
          <button
            className={`${iconAction} text-muted hover:bg-hover`}
            aria-label="Ta bort färgen"
            onClick={() => updatePart(instanceId, { paint: undefined })}
          >
            <X {...ICON_SM} />
          </button>
        </Tip>
      </div>
    </div>
  )
}
