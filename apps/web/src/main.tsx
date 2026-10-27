import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { normalizeLegacyUrl } from './router.ts';
import './index.css';

// Old bookmarks (/#/skills/caveman) become clean URLs (/skills/caveman) before the first render, in place.
normalizeLegacyUrl();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
