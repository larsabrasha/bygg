import { useState } from 'react'
import { useViewStore } from '../store/viewStore'
import { CutList } from './CutList'
import { Params } from './Params'
import { Properties } from './Properties'

type Tab = 'properties' | 'params' | 'cutlist'

/** Samma gräns som varianten narrow i index.css. */
const NARROW = '(max-width: 720px)'

// På smal skärm markeras aktiv flik bara när bladet är öppet.
const tabClass =
  'min-h-12 flex-1 cursor-pointer border-b-2 border-transparent font-semibold text-muted aria-selected:border-accent aria-selected:text-accent narrow:group-data-[open=false]/sheet:aria-selected:border-transparent narrow:group-data-[open=false]/sheet:aria-selected:text-muted'

/**
 * Egenskaper, Parametrar och Kaplista i var sin flik.
 * Desktop: sidopanel som går att dölja (knappen i raden överst). Smal skärm: blad längst ner; tryck på aktiv flik fäller ihop det.
 * Öppet blad har fast höjd, så att 3D-vyn inte byter storlek när man byter flik.
 * Samma DOM i båda lägena; CSS väljer layout, så fältens state överlever en rotation.
 */
export function Sidebar() {
  const [tab, setTab] = useState<Tab>('properties')
  const [open, setOpen] = useState(false)
  const panelOpen = useViewStore((s) => s.panelOpen)
  // Döljs med CSS, inte tas bort, så att fältens state finns kvar när den visas igen.
  const hidden = useViewStore((s) => s.focusMode) ? 'hidden' : panelOpen ? '' : 'hidden narrow:flex'

  const onTab = (t: Tab) => {
    // Bara bladet på smal skärm fälls ihop; på desktop är panelen alltid öppen.
    if (t === tab && open && matchMedia(NARROW).matches) setOpen(false)
    else {
      setTab(t)
      setOpen(true)
    }
  }

  const tabs: [Tab, string][] = [
    ['properties', 'Egenskaper'],
    ['params', 'Parametrar'],
    ['cutlist', 'Kaplista'],
  ]

  return (
    <aside
      data-tab={tab}
      data-open={open}
      className={`group/sheet flex flex-col ${hidden} overflow-hidden border-l border-line bg-panel [grid-area:sidebar]
        narrow:data-[open=true]:h-[calc((100dvh-var(--keyboard,0px))*0.5)] narrow:rounded-t-xl narrow:border-t narrow:border-l-0
        narrow:pb-[env(safe-area-inset-bottom)] narrow:shadow-[0_-2px_12px_rgb(0_0_0/8%)]`}
    >
      <div className="flex flex-none border-b border-line narrow:border-b-0" role="tablist">
        {tabs.map(([t, label]) => (
          <button key={t} role="tab" className={tabClass} aria-selected={tab === t} onClick={() => onTab(t)}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto overscroll-contain p-4 narrow:group-data-[open=false]/sheet:hidden">
        <Properties />
        <Params />
        <CutList />
      </div>
    </aside>
  )
}
