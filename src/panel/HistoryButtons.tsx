import { Redo2, Undo2 } from 'lucide-react'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import { Tip } from './Tip'
import { ICON, iconButton } from './ui'

/** Ångra. En pågående operation (t.ex. Dra ut) avbryts först. */
type Props = { tipSide?: 'bottom' | 'left'; buttonClass?: string }

export function UndoButton({ tipSide = 'bottom', buttonClass = iconButton }: Props) {
  const canUndo = useDocumentStore((s) => s.past.length > 0)
  return (
    <Tip label="Ångra" keys="⌘Z" side={tipSide}>
      <button
        className={buttonClass}
        disabled={!canUndo}
        aria-label="Ångra"
        onClick={() => {
          useToolStore.getState().setOp(null)
          useDocumentStore.getState().undo()
        }}
      >
        <Undo2 {...ICON} />
      </button>
    </Tip>
  )
}

/** Gör om. onlyWhenAvailable: dold i stället för gråad när det inte finns något att göra om. */
export function RedoButton({
  tipSide = 'bottom',
  buttonClass = iconButton,
  onlyWhenAvailable = false,
}: Props & { onlyWhenAvailable?: boolean }) {
  const canRedo = useDocumentStore((s) => s.future.length > 0)
  if (onlyWhenAvailable && !canRedo) return null
  return (
    <Tip label="Gör om" keys="⇧⌘Z" side={tipSide}>
      <button
        className={buttonClass}
        disabled={!canRedo}
        aria-label="Gör om"
        onClick={() => useDocumentStore.getState().redo()}
      >
        <Redo2 {...ICON} />
      </button>
    </Tip>
  )
}
