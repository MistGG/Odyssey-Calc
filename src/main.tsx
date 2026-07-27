import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthProvider } from './auth/AuthProvider'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import App from './App.tsx'

try {
  sessionStorage.removeItem('odyssey-calc-stale-asset-reload')
} catch {
  /* ignore */
}

window.addEventListener('vite:preloadError', () => {
  // One-shot only — unbounded reload() here can loop when a tab wakes and
  // hits a missing chunk (e.g. after a deploy while backgrounded).
  const key = 'odyssey-calc-stale-asset-reload'
  try {
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
  } catch {
    /* ignore */
  }
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
