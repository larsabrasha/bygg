import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { useLibraryStore } from '../store/libraryStore'
import { renameModel, showGallery } from '../sync/session'
import { Logo } from './Logo'
import { field } from './ui'
import { Tip } from './Tip'

/**
 * Tillbaka till startvyn (Bygg), och modellens namn. Namnet är text, inte en knapp:
 * ett tryck bredvid bakåtknappen ska inte börja redigera. Dubbeltryck eller
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
    <div className="flex min-w-0 items-center gap-2 narrow:gap-1">
      {/*
        Tillbaka till alla modeller. Bred skärm: loggan (Bygg), som i startvyn och som i
        Google Docs och Onshape, med luft före modellens namn: skrivstilen skiljer dem, så inget
        tecken behövs emellan. Smal skärm: bara en bakåtpil,
        som i appar för iPhone, så att namnet får platsen. 44 px hög med finger (också på iPad).
      */}
      <Tip label="Alla modeller">
        <button
          className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-1.5 font-semibold hover:bg-hover pointer-coarse:h-11 narrow:h-11 narrow:w-12 narrow:justify-center narrow:px-0"
          aria-label="Alla modeller"
          onClick={() => void showGallery()}
        >
          <ChevronLeft size={24} strokeWidth={1.75} aria-hidden className="hidden narrow:block" />
          <span className="narrow:hidden">
            <Logo />
          </span>
        </button>
      </Tip>
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
        <Tip label="Dubbelklicka för att byta namn">
          <h1
            className="min-w-0 truncate pl-1 font-semibold select-none narrow:pl-0"
            onDoubleClick={() => {
              setName(currentName)
              setRenaming(true)
            }}
          >
            {currentName || 'Modell'}
          </h1>
        </Tip>
      )}
    </div>
  )
}
