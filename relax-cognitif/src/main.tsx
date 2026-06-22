import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// Lancée depuis l'écran d'accueil (PWA installée), l'appli démarre toujours
// sur la page d'accueil, jamais sur la dernière page ouverte. N'affecte pas
// la navigation interne ni le rafraîchissement dans un onglet de navigateur.
const isStandalone =
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
if (isStandalone && window.location.pathname !== '/') {
  window.history.replaceState(null, '', '/');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
