import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isFirebaseConfigured } from './lib/firebase'

console.log('STACKY DEBUG: Main module executing')
console.log('STACKY DEBUG: Environment variables:', import.meta.env)
console.log('STACKY DEBUG: Firebase configured:', isFirebaseConfigured)

const rootEl = document.getElementById('root')

function renderError(err: unknown) {
  if (!rootEl) return
  const message = err instanceof Error ? err.message : String(err)
  rootEl.innerHTML = `
    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:#0a0a0a;color:#d4d4d4;font-family:system-ui,sans-serif;">
      <h1 style="color:#fff;font-size:1.25rem;">Something went wrong</h1>
      <pre style="margin-top:16px;max-width:600px;overflow:auto;padding:16px;background:rgba(255,255,255,0.05);border-radius:12px;font-size:13px;">${message.replace(/</g, '&lt;')}</pre>
      <p style="margin-top:16px;font-size:14px;color:#737373;">Check the browser console for details.</p>
    </div>
  `
}

window.addEventListener('error', (event) => {
  renderError(event.error)
})

window.addEventListener('unhandledrejection', (event) => {
  renderError(event.reason)
})

try {
  if (!rootEl) throw new Error('Root element not found')

  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (err) {
  console.error(err)
  renderError(err)
}

