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
  share,
  onPrint,
}: {
  onClose: () => void
  onZoomOut?: () => void
  onZoomIn?: () => void
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
      <div className="flex-1" />
      <Tip label="Förminska">
        <button className={iconButton} aria-label="Förminska" disabled={!onZoomOut} onClick={onZoomOut}>
          <ZoomOut {...ICON} />
        </button>
      </Tip>
      <Tip label="Förstora">
        <button className={iconButton} aria-label="Förstora" disabled={!onZoomIn} onClick={onZoomIn}>
          <ZoomIn {...ICON} />
        </button>
      </Tip>
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
  )
}
