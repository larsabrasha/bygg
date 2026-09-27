import { useEffect, useState } from 'react'
import { VIEWS, type View } from './models'
import { Stage } from './Stage'
import { stillsKey } from './stillsKey'

/**
 * Möblerna på startsidan en och en, i kvadratiska bilder utan bakgrund, att fotografera
 * till stillbilderna (scripts/landingStills.ts, npm run stills). Bara i dev, med ?stillbilder.
 */

/** Bildens sida i CSS-pixlar; skriptet tar den med dubbel upplösning. */
const STILL_SIZE = 800

function Shot({ view }: { view: View }) {
  const [ready, setReady] = useState(false)
  return (
    <div data-still={view.name} data-ready={ready || undefined} style={{ width: STILL_SIZE, height: STILL_SIZE }}>
      <Stage
        bodies={view.bodies}
        angle={view.angle}
        fill={view.fill}
        spin={0}
        label={view.name}
        className="size-full"
        onReady={() => setReady(true)}
      />
    </div>
  )
}

export function Stills() {
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])
  return (
    <div className="flex flex-wrap" data-key={stillsKey(VIEWS)}>
      {VIEWS.map((v) => (
        <Shot key={v.name} view={v} />
      ))}
    </div>
  )
}
