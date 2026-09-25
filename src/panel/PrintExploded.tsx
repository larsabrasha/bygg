import { useLibraryStore } from '../store/libraryStore'
import { usePrintStore } from '../store/printStore'

/**
 * Sprängskissen som den skrivs ut: bilden av vyn och delarnas namn ovanpå,
 * där delarna står. Syns bara i utskrift, och bara när den skrivs ut (explodeActions).
 * Fasta färger, så att utskriften blir svart på vitt även i mörkt läge.
 */
export function PrintExploded() {
  const what = usePrintStore((s) => s.what)
  const image = usePrintStore((s) => s.image)
  const name = useLibraryStore((s) => s.currentName)
  if (what !== 'exploded' || !image) return null
  return (
    <div className="hidden bg-white text-[11pt] text-black print:block">
      <h1 className="text-[16pt] font-semibold">{name || 'Modell'}</h1>
      <p className="mb-4 text-[10pt] text-neutral-600">Sprängskiss · {new Date().toLocaleDateString('sv-SE')}</p>
      <div className="relative" style={{ aspectRatio: `${image.width} / ${image.height}` }}>
        <img src={image.url} alt="" className="absolute inset-0 size-full object-contain" />
        {image.labels.map((l, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded border border-neutral-400 bg-white px-1 text-[9pt] whitespace-nowrap"
            style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%` }}
          >
            {l.name}
          </span>
        ))}
      </div>
    </div>
  )
}
