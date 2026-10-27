import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { catalogPlugin, defaultRegistryRoot } from './catalog-plugin.ts';

// BASE_PATH lets a static host serve from a sub-path, e.g. GitHub Pages project sites:
//   BASE_PATH=/ecosystem-skills/ pnpm build
function normalizeBase(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

export default defineConfig({
  base: normalizeBase(process.env.BASE_PATH),
  plugins: [
    react(),
    tailwindcss(),
    // Generates catalog.json from registry/*.json into every build (and serves it in dev).
    catalogPlugin({
      registryRoot: defaultRegistryRoot(fileURLToPath(new URL('.', import.meta.url))),
    }),
  ],
  test: { environment: 'node' },
});
