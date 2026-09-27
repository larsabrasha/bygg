/**
 * Hur långt något har kommit (value 0–1), med vad som görs just nu ovanför.
 * Stapeln fylls i steg; en glans sveper över det ifyllda hela tiden, så att man ser att
 * något händer också när den står still. Både fyllnaden och glansen flyttas med
 * transform, som webbläsaren animerar utanför huvudtråden: de rör sig också medan
 * ett långt steg (en bild till PDF:en) räknas.
 *
 * glide: millisekunder att glida fram till value, jämnt (för en väntan med känd längd).
 * Utan glide tar stapeln steget på en kort stund.
 */
export function ProgressBar({ label, value, glide }: { label: string; value: number; glide?: number }) {
  const part = Math.min(1, Math.max(0, value))
  return (
    <div className="flex w-64 max-w-full flex-col items-center gap-2.5">
      <p aria-live="polite">{label}</p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(part * 100)}
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-line"
      >
        <div
          className="absolute inset-0 origin-left overflow-hidden bg-accent transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{
            transform: `scaleX(${part})`,
            ...(glide !== undefined && { transitionDuration: `${glide}ms`, transitionTimingFunction: 'linear' }),
          }}
        >
          {/* I fyllnaden, så att glansen bara syns på det som är klart; den skalas med den. */}
          <div className="absolute inset-y-0 left-0 w-1/3 animate-sweep bg-linear-to-r from-transparent via-white/50 to-transparent motion-reduce:hidden" />
        </div>
      </div>
    </div>
  )
}
