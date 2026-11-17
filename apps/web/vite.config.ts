import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { catalogPlugin, defaultRegistryRoot } from './catalog-plugin.ts';

// BASE_PATH lets a static host serve from a sub-path, e.g. GitHub Pages project sites:
//   BASE_PATH=/ecosystem-skills/ pnpm build
function normalizeBase(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

/**
 * ES28: preload the two self-hosted body fonts in the built index.html. They are fingerprinted by Vite, so the links
 * are added after bundling. With `font-display: optional` (index.css) a preloaded font is ready before first paint, so
 * text never swaps faces and reflows.
 */
function preloadFonts(): Plugin {
  let base = '/';
  return {
    name: 'ecosystem-skills:preload-fonts',
    apply: 'build',
    configResolved(c) {
      base = c.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const fonts = Object.keys(ctx.bundle ?? {}).filter((f) =>
          /^assets\/AtkinsonHyperlegible-(Regular|Bold)-[\w-]+\.woff2$/.test(f),
        );
        return fonts.map((f) => ({
          tag: 'link',
          attrs: {
            rel: 'preload',
            as: 'font',
            type: 'font/woff2',
            crossorigin: '',
            href: base + f,
          },
          injectTo: 'head' as const,
        }));
      },
    },
  };
}

export default defineConfig({
  base: normalizeBase(process.env.BASE_PATH),
  plugins: [
    react(),
    tailwindcss(),
    preloadFonts(),
    // Generates catalog.json from registry/*.json into every build (and serves it in dev).
    catalogPlugin({
      registryRoot: defaultRegistryRoot(fileURLToPath(new URL('.', import.meta.url))),
    }),
  ],
  test: { environment: 'node' },
});
