import { MeasureBox } from './panel/MeasureBox'
import { Sidebar } from './panel/Sidebar'
import { Toolbar } from './panel/Toolbar'
import { Viewport } from './scene/Viewport'
import { useShortcuts } from './tools/useShortcuts'

export function App() {
  useShortcuts()
  return (
    // minmax(0, …): annars får raden inte bli lägre än canvasens nuvarande höjd.
    <div
      className="grid h-dvh grid-cols-[minmax(0,1fr)_340px] grid-rows-[auto_minmax(0,1fr)] [grid-template-areas:'toolbar_toolbar''viewport_sidebar']
        narrow:grid-cols-[minmax(0,1fr)] narrow:grid-rows-[auto_minmax(0,1fr)_auto] narrow:[grid-template-areas:'toolbar''viewport''sidebar']"
    >
      <Toolbar />
      <main className="relative min-h-0 min-w-0 [grid-area:viewport]">
        <Viewport />
        <MeasureBox />
      </main>
      <Sidebar />
    </div>
  )
}
