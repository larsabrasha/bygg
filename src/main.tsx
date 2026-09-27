import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { startAuth } from './sync/auth'
import './index.css'

const render = (node: ReactNode) => createRoot(document.getElementById('root')!).render(<StrictMode>{node}</StrictMode>)

// Utan inloggning visas startsidan; appen (och allt den läser in) laddas bara för den som är inloggad.
// I dev finns ingen inloggning; där visar ?startsida den.
const preview = import.meta.env.DEV && new URLSearchParams(location.search).has('startsida')
if (preview || (await startAuth()) === 'landing') {
  const { Landing } = await import('./landing/Landing')
  render(<Landing />)
} else {
  await import('./bootstrap')
  const { App } = await import('./App')
  render(<App />)
}
