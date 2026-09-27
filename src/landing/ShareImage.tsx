import { useEffect } from 'react'
import { Logo } from '../panel/Logo'
import bord from './stills/bord-light.webp'
import { Wood } from './Wood'

/**
 * Bilden som visas när någon delar en länk till Bygg (og:image i index.html), 1200 × 630
 * som Facebook, LinkedIn och Slack vill ha. Rubriken och bordet som överst på startsidan.
 * Fotograferas av scripts/landingStills.ts (npm run stills) till public/delningsbild.jpg.
 * Bara i dev, med ?delningsbild.
 */
export function ShareImage() {
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])
  return (
    <div
      data-share
      className="relative flex h-[630px] w-[1200px] flex-col justify-center overflow-hidden bg-studio px-[84px] text-ink"
    >
      <img src={bord} alt="" className="absolute top-1/2 left-[560px] w-[720px] max-w-none -translate-y-1/2" />
      <div className="relative">
        <Logo height={44} />
        <h1 className="mt-10 text-[92px] leading-[0.95] font-semibold tracking-[-0.035em]">
          Från skiss
          <br />
          <Wood>till kaplista.</Wood>
        </h1>
        <p className="mt-8 max-w-[560px] text-[26px] leading-snug text-muted">
          Möbler i 3D, med kaplista, kapschema och ritning.
        </p>
      </div>
    </div>
  )
}
