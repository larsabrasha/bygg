import { Printer, X, ZoomIn, ZoomOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { Tip } from './Tip'
import { iconButton, ICON, primaryButton } from './ui'

/**
 * Ritningens verktygsrad: stäng, zoom, dela eller ladda ner, och skriv ut. Samma rad
 * medan ritningen skapas (knapparna gråa) som när den visas, så att den inte byter
 * utseende mitt i. En knapp utan åtgärd (undefined) är grå.
 */
export function DrawingBar({
  onClose,
  onZoomOut,
  onZoomIn,
  zoom = 1,
  onZoomReset,
  share,
  onPrint,
}: {
  onClose: () => void
  onZoomOut?: () => void
  onZoomIn?: () => void
  /** Zoomen, där 1 = hela sidans bredd. Visas i procent mellan knapparna. */
  zoom?: number
  /** Tillbaka till hela sidans bredd (tryck på procenttalet); bara när man zoomat in. */
  onZoomReset?: () => void
  share: { label: string; icon: ReactNode; onClick?: () => void }
  onPrint?: () => void
}) {
  return (
    <div className="flex h-14 flex-none items-center gap-1 border-b border-line bg-panel px-2 pt-[env(safe-area-inset-top)]">
      <Tip label="Stäng" keys="Esc">
        <button className={iconButton} aria-label="Stäng ritningen" onClick={onClose}>
          <X {...ICON} />
        </button>
      </Tip>
      <h2 className="pl-1 text-[15px] font-semibold narrow:sr-only">Ritning</h2>
      {/* Zoom i en egen grupp, sedan dela och skriv ut, med luft och en linje emellan (som i verktygsraden). */}
      <div className="ml-auto flex shrink-0 items-center gap-4 narrow:gap-2">
        <div className="flex items-center gap-0.5" role="group" aria-label="Zoom">
          <Tip label="Förminska">
            <button className={iconButton} aria-label="Förminska" disabled={!onZoomOut} onClick={onZoomOut}>
              <ZoomOut {...ICON} />
            </button>
          </Tip>
          {/* Som i Word och Figma: procenttalet visar läget, och ett tryck på det ger hela sidan igen. */}
          <Tip label="Visa hela sidan" keys="⇧Z">
            <button
              className="h-9 min-w-12 shrink-0 cursor-pointer rounded-lg px-1 text-[13px] font-medium tabular-nums hover:bg-hover disabled:cursor-default disabled:text-disabled disabled:hover:bg-transparent narrow:h-11"
              aria-label={`Zoom ${Math.round(zoom * 100)} procent. Visa hela sidan`}
              disabled={!onZoomReset}
              onClick={onZoomReset}
            >
              {`${Math.round(zoom * 100)}\u00a0%`}
            </button>
          </Tip>
          <Tip label="Förstora">
            <button className={iconButton} aria-label="Förstora" disabled={!onZoomIn} onClick={onZoomIn}>
              <ZoomIn {...ICON} />
            </button>
          </Tip>
        </div>
        <span aria-hidden className="h-6 w-px shrink-0 bg-line narrow:hidden" />
        <Tip label={share.label}>
          <button className={iconButton} aria-label={share.label} disabled={!share.onClick} onClick={share.onClick}>
            {share.icon}
          </button>
        </Tip>
        <Tip label="Skriv ut" keys="⌘P">
          <button className={primaryButton} aria-label="Skriv ut" disabled={!onPrint} onClick={onPrint}>
            <Printer size={16} strokeWidth={1.75} aria-hidden />
            <span className="narrow:hidden">Skriv ut</span>
          </button>
        </Tip>
      </div>
    </div>
  )
}
