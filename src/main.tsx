import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'
import { useDocumentStore } from './store/documentStore'
import { useToolStore } from './store/toolStore'

// Bara i dev: gör storarna åtkomliga från konsolen för felsökning och webbläsartester.
if (import.meta.env.DEV) Object.assign(window, { __bygg: { docs: useDocumentStore, tools: useToolStore } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
