import { Gallery } from './panel/Gallery'
import { DimensionLabels } from './panel/DimensionLabels'
import { MeasureBox } from './panel/MeasureBox'
import { Notices } from './panel/Notices'
import { PrintCutList } from './panel/PrintCutList'
import { SelectionBar } from './panel/SelectionBar'
import { Sidebar } from './panel/Sidebar'
import { Toolbar } from './panel/Toolbar'
import { ToolRail } from './panel/ToolButtons'
import { ViewButtons } from './panel/ViewButtons'
import { TipProvider } from './panel/Tip'
import { Viewport } from './scene/Viewport'
import { useLibraryStore } from './store/libraryStore'
import { useViewStore } from './store/viewStore'
import { useShortcuts } from './tools/useShortcuts'

export function App() {
  useShortcuts()
  const screen = useLibraryStore((s) => s.screen)
  const panelOpen = useViewStore((s) => s.panelOpen)
  const focusMode = useViewStore((s) => s.focusMode)
  return (
    <TipProvider>
      {/* minmax(0, …): annars får raden inte bli lägre än canvasens nuvarande höjd.
          Vid utskrift döljs appen och bara kaplistan skrivs ut. */}
      {/* inert: under startvyn går 3D-vyns knappar inte att nå med Tab eller skärmläsare. */}
      {/* Dold detaljpanel (bara bred skärm): 3D-vyn tar hela bredden. Fokusläge: bara 3D-vyn. */}
      <div
        inert={screen === 'gallery'}
        className={`grid h-dvh print:hidden ${
          focusMode
            ? "grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] [grid-template-areas:'viewport']"
            : `grid-rows-[auto_minmax(0,1fr)] narrow:grid-cols-[minmax(0,1fr)] narrow:grid-rows-[auto_minmax(0,1fr)_auto] narrow:[grid-template-areas:'toolbar''viewport''sidebar'] ${
                panelOpen
                  ? "grid-cols-[minmax(0,1fr)_360px] [grid-template-areas:'toolbar_toolbar''viewport_sidebar']"
                  : "grid-cols-[minmax(0,1fr)] [grid-template-areas:'toolbar''viewport']"
              }`
        }`}
      >
        <Toolbar />
        <main className="relative min-h-0 min-w-0 [grid-area:viewport]">
          <Viewport />
          <DimensionLabels />
          {/* Startvyn visar samma meddelanden själv. */}
          {screen === 'model' && <Notices />}
          <MeasureBox />
          <ViewButtons />
          <ToolRail />
          <SelectionBar />
        </main>
        <Sidebar />
      </div>
      {/* Startvyn ligger ovanpå; 3D-vyn hålls kvar under så att den kan ta bilder och öppnas snabbt. */}
      {screen === 'gallery' && <Gallery />}
      <PrintCutList />
    </TipProvider>
  )
}
