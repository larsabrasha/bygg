import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { useLibraryStore } from '../store/libraryStore'
import { renameModel, showGallery } from '../sync/session'
import { SyncBadge } from './SyncBadge'
import { field } from './ui'

/** Tillbaka till startvyn, och modellens namn: tryck på namnet för att byta det. */
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
    <div className="flex min-w-0 items-center">
      <button
        className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-md hover:bg-hover narrow:size-11"
        aria-label="Alla modeller"
        title="Alla modeller"
        onClick={() => void showGallery()}
      >
        <ChevronLeft size={22} strokeWidth={1.75} aria-hidden />
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
        <button
          className="min-h-9 min-w-0 cursor-text truncate rounded-md px-1.5 text-left font-semibold hover:bg-hover narrow:min-h-11"
          title="Byt namn"
          onClick={() => {
            setName(currentName)
            setRenaming(true)
          }}
        >
          {currentName || 'Modell'}
        </button>
      )}
      <SyncBadge withLabel={false} />
    </div>
  )
}
