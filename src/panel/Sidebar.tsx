import { useState } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { CutList } from './CutList'
import { Properties } from './Properties'

type Tab = 'properties' | 'cutlist'

// Aktiv flik markeras bara när bladet är öppet.
const tabClass =
  'min-h-12 flex-1 cursor-pointer border-b-2 border-transparent font-semibold text-muted group-data-[open=true]/sheet:aria-selected:border-accent group-data-[open=true]/sheet:aria-selected:text-accent'

/**
 * Desktop: fast sidopanel med båda sektionerna.
 * Smal skärm: blad längst ner med flikar. Tryck på aktiv flik fäller ihop bladet.
 * Samma DOM i båda lägena; CSS väljer layout, så fältens state överlever en rotation.
 */
export function Sidebar() {
  const count = useDocumentStore((s) => s.doc.bodies.length)
  const [tab, setTab] = useState<Tab>('properties')
  const [open, setOpen] = useState(false)

  const onTab = (t: Tab) => {
    if (t === tab && open) setOpen(false)
    else {
      setTab(t)
      setOpen(true)
    }
  }

  return (
    <aside
      data-tab={tab}
      data-open={open}
      className="group/sheet overflow-y-auto border-l border-line bg-panel [grid-area:sidebar]
        narrow:flex narrow:max-h-[60dvh] narrow:flex-col narrow:overflow-hidden narrow:rounded-t-xl narrow:border-t narrow:border-l-0
        narrow:pb-[env(safe-area-inset-bottom)] narrow:shadow-[0_-2px_12px_rgb(0_0_0/8%)]"
    >
      {/* Flikarna används bara på smal skärm. */}
      <div className="hidden flex-none narrow:flex" role="tablist">
        <button role="tab" className={tabClass} aria-selected={tab === 'properties'} onClick={() => onTab('properties')}>
          Egenskaper
        </button>
        <button role="tab" className={tabClass} aria-selected={tab === 'cutlist'} onClick={() => onTab('cutlist')}>
          Kaplista ({count})
        </button>
      </div>
      <div className="flex flex-col gap-6 p-4 narrow:overflow-y-auto narrow:overscroll-contain narrow:group-data-[open=false]/sheet:hidden">
        <Properties />
        <CutList />
      </div>
    </aside>
  )
}
