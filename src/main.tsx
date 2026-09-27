import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { startAuth } from './sync/auth'
import './index.css'

const render = (node: ReactNode) => createRoot(document.getElementById('root')!).render(<StrictMode>{node}</StrictMode>)

// Utan inloggning visas startsidan; appen (och allt den läser in) laddas bara för den som är inloggad.
// ?startsida visar den ändå: i dev och i förhandsvisningen av bygget finns ingen inloggning.
// Sidan är öppen för alla, så det gör inget att den går att nå inloggad.
const preview = new URLSearchParams(location.search).has('startsida')
if (preview || (await startAuth()) === 'landing') {
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
