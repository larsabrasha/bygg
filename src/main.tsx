import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { canOpenApp, startAuth } from './sync/auth'
import './index.css'

const render = (node: ReactNode) => createRoot(document.getElementById('root')!).render(<StrictMode>{node}</StrictMode>)

// Utan inloggning visas startsidan; appen (och allt den läser in) laddas bara för den som är inloggad.
// På /intro visas startsidan för alla, också den som är inloggad; då leder knapparna in i appen.
const params = new URLSearchParams(location.search)
const intro = location.pathname.replace(/\/$/, '') === '/intro'
if (import.meta.env.DEV && params.has('stillbilder')) {
  // Möblerna på startsidan att fotografera till stillbilderna (npm run stills).
  const { Stills } = await import('./landing/Stills')
  render(<Stills />)
} else if (import.meta.env.DEV && params.has('delningsbild')) {
  // Bilden för delade länkar, att fotografera (npm run stills).
  const { ShareImage } = await import('./landing/ShareImage')
  render(<ShareImage />)
} else if (intro) {
  const [{ Landing }, open] = await Promise.all([import('./landing/Landing'), canOpenApp()])
  render(<Landing openApp={open} />)
} else if ((await startAuth()) === 'landing') {
  const { Landing } = await import('./landing/Landing')
  render(<Landing />)
} else {
  // Appen hämtas medan bootstrap öppnar modellen: på en ny enhet väntar den på en hel synk
  // med servern, och på långsamt nät tar båda sekunder. (Före startsidan var App en statisk
  // import och hämtades lika tidigt.)
  const app = import('./App')
  await import('./bootstrap')
  const { App } = await app
  render(<App />)
}
