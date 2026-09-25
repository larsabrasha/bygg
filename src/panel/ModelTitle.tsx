import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { useLibraryStore } from '../store/libraryStore'
import { renameModel, showGallery } from '../sync/session'
import { field } from './ui'

/**
 * Tillbaka till startvyn, och modellens namn. Namnet är text, inte en knapp:
 * ett tryck bredvid bakåtpilen ska inte börja redigera. Dubbeltryck eller
 * dubbelklick byter namn; det går också från "…" i startvyn.
 */
export function ModelTitle() {
  const currentId = useLibraryStore((s) => s.currentId)
  const currentName = useLibraryStore((s) => s.currentName)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')

  const save = () => {
    if (currentId && name.trim() && name !== currentName) void renameModel(currentId, name)
    setRenaming(false)
  }

  return (
    <div className="flex min-w-0 items-center gap-1 narrow:gap-2">
      {/* 40 px, 44 px med finger (också på iPad, som har bred layout); bredare än hög på smal skärm. */}
      <button
        className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-hover pointer-coarse:size-11 narrow:h-11 narrow:w-12"
        aria-label="Alla modeller"
        title="Alla modeller"
        onClick={() => void showGallery()}
      >
        <ChevronLeft size={24} strokeWidth={1.75} aria-hidden />
      </button>
      {renaming ? (
        <input
          className={`${field} min-w-24 font-semibold`}
          aria-label="Modellens namn"
          value={name}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setRenaming(false)
          }}
        />
      ) : (
        <h1
          className="min-w-0 truncate font-semibold select-none"
          title="Dubbelklicka för att byta namn"
          onDoubleClick={() => {
            setName(currentName)
            setRenaming(true)
          }}
        >
          {currentName || 'Modell'}
        </h1>
      )}
    </div>
  )
}
