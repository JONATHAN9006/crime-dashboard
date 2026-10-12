import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { instalarBloqueoDescargas } from './utils/bloqueoDescargas'

// Enlace /cai (solo consulta): sin descargas ni cargas de archivos.
instalarBloqueoDescargas()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
