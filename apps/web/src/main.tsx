import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { normalizeLegacyUrl } from './router.ts';
import './index.css';

// Old bookmarks (/#/skills/caveman) become clean URLs (/skills/caveman) before the first render, in place.
normalizeLegacyUrl();

// PWA (ES26): production builds only, so development never serves stale files. The worker caches the public app
// shell and catalog; offline data is marked as such and is never authoritative for approvals or installation.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => {
        /* unsupported or blocked: the site works the same without it */
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
