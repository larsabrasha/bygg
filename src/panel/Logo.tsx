import { WORDMARK, WORDMARK_WIDTH } from './wordmark'

/** Loggan: ordet Bygg. Färgen följer texten (currentColor). height: ordets höjd i px. */
export function Logo({ height = 26 }: { height?: number }) {
  return (
    <svg
      role="img"
      aria-label="Bygg"
      viewBox={`0 0 ${WORDMARK_WIDTH} 100`}
      height={height}
      width={Math.round((height * WORDMARK_WIDTH) / 100)}
      fill="currentColor"
    >
      <path d={WORDMARK} />
    </svg>
  )
}
