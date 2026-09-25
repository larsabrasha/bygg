import { CombineBar } from './panel/CombineBar'
import { Gallery } from './panel/Gallery'
import { DimensionLabels } from './panel/DimensionLabels'
import { MeasureBox } from './panel/MeasureBox'
import { Notices } from './panel/Notices'
import { PrintExploded } from './panel/PrintExploded'
import { ExplodeBar } from './panel/ExplodeBar'
import { Drawing } from './panel/Drawing'
import { VisibilityBar } from './panel/VisibilityBar'
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
import { usePenFieldGuard } from './panel/usePenFieldGuard'
import { useKeyboardInset } from './panel/useKeyboardInset'
import { usePreventPageZoom } from './panel/usePreventPageZoom'

export function App() {
  useShortcuts()
  usePenFieldGuard()
  useKeyboardInset()
  usePreventPageZoom()
  const screen = useLibraryStore((s) => s.screen)
  const panelOpen = useViewStore((s) => s.panelOpen)
  const focusMode = useViewStore((s) => s.focusMode)
  const exploded = useViewStore((s) => s.exploded)
  const drawing = useViewStore((s) => s.drawing)
  return (
    <TipProvider>
      {/* minmax(0, …): annars får raden inte bli lägre än canvasens nuvarande höjd.
          Vid utskrift döljs appen; det som skrivs ut är ritningen eller sprängskissen. */}
      {/* inert: under startvyn går 3D-vyns knappar inte att nå med Tab eller skärmläsare.
          Under ritningen är appen också osynlig, så att en öppen meny (z-50) inte syns ovanpå. */}
      {/* Dold detaljpanel (bara bred skärm): 3D-vyn tar hela bredden. Fokusläge: bara 3D-vyn. */}
      {/* --keyboard: tangentbordet på iPhone och iPad (useKeyboardInset); appen blir lägre, så att det
          som ligger längst ner (måttrutan, bladet) hamnar ovanför det. */}
      <div
        inert={screen === 'gallery' || drawing}
        className={`grid h-[calc(100dvh-var(--keyboard,0px))] print:hidden ${drawing ? 'invisible' : ''} ${
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
          {/* I sprängskissen ändrar man inget: raden där ersätter måttrutan och verktygen. */}
          {exploded ? (
            <ExplodeBar />
          ) : (
            <>
              <MeasureBox />
              <CombineBar />
              <ToolRail />
            </>
          )}
          <ViewButtons />
          <SelectionBar />
          <VisibilityBar />
        </main>
        <Sidebar />
      </div>
      {/* Startvyn ligger ovanpå; 3D-vyn hålls kvar under så att den kan ta bilder och öppnas snabbt. */}
      {screen === 'gallery' && <Gallery />}
      {/* Ritningen ligger ovanpå allt, som startvyn. */}
      <Drawing />
      <PrintExploded />
    </TipProvider>
  )
}
