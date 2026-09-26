import { LoaderCircle } from 'lucide-react'
import { useLibraryStore } from '../store/libraryStore'

/**
 * "Öppnar …" över 3D-vyn medan en modell öppnas (libraryStore.opening): när
 * appen startar, och om det tar tid efter att startvyn stängts. I startvyn
 * visar brickan man tryckte på det i stället (Gallery). Rutan finns från
 * början men tonas in först efter en stund (animate-appear-late), så att den
 * inte blinkar till när en liten modell öppnas. Både intoningen och snurran är
 * CSS-animationer, som webbläsaren kör vidare också när sidan är upptagen med
 * att räkna fram delarna; en timer i JavaScript skulle vänta tills det är klart.
 */
export function OpeningOverlay() {
  const opening = useLibraryStore((s) => s.opening)
  const gallery = useLibraryStore((s) => s.screen === 'gallery')
  if (!opening || gallery) return null
  const { name } = opening
  return (
    <div
      className="fixed inset-0 z-50 grid animate-appear-late place-items-center bg-canvas/40 print:hidden"
      role="status"
    >
      <div className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-4 py-3 shadow-md">
        <LoaderCircle size={20} strokeWidth={2} className="animate-spin text-accent" aria-hidden />
        <p className="text-[13px]">{name ? `Öppnar ${name} …` : 'Öppnar …'}</p>
      </div>
    </div>
  )
}
