import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// One-time forced reload on first load per tab session, to avoid the
// browser serving a stale cached bundle (e.g. after a fresh deploy or
// a long-open tab). Guarded by sessionStorage so it only fires once —
// without the guard this would reload forever.
const RELOAD_FLAG = 'app_cache_cleared_v1';

if (!sessionStorage.getItem(RELOAD_FLAG)) {
  sessionStorage.setItem(RELOAD_FLAG, 'true');

  // Clear any Cache Storage entries (relevant if a service worker or
  // manual caching is ever added later) before forcing a hard reload.
  if ('caches' in window) {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }

  window.location.reload(true); // legacy `true` arg is a no-op in modern browsers but harmless
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}