import { join } from 'node:path';
import type { Plugin } from 'vite';
import { catalogToJson, loadRegistry } from '@ecosystem-skills/catalog';

/**
 * Generates catalog.json from registry/*.json as part of the Vite build, so every production build of the
 * site contains it, whichever command runs `vite build` (the root script, the package script, or a host's
 * framework default). The catalog is emitted straight into the build output, not into public/, so no
 * generated file has to exist before the build and a stale copy can never be published.
 *
 * It reuses the registry loader of @ecosystem-skills/catalog (the same strict validation as
 * `pnpm catalog:validate`) and fails the build with the validation errors if the registry is invalid:
 * a site without a catalog must never be deployed.
 */
export function catalogPlugin({ registryRoot }: { registryRoot: string }): Plugin {
  const generate = (): string => {
    try {
      return catalogToJson(loadRegistry(registryRoot).catalog);
    } catch (e) {
      throw new Error(`Catalog generation failed: ${e instanceof Error ? e.message : String(e)}`, {
        cause: e,
      });
    }
  };
  let serving = false;
  return {
    name: 'ecosystem-skills-catalog',
    configResolved(config) {
      serving = config.command === 'serve';
    },
    buildStart() {
      if (serving) return; // dev and test servers serve the catalog from memory (below); they cannot emit files
      // Throws on an invalid or missing registry, which fails `vite build` (non-zero exit).
      this.emitFile({ type: 'asset', fileName: 'catalog.json', source: generate() });
    },
    configureServer(server) {
      // Dev: serve a freshly generated catalog, so `vite` works on its own and always reflects the registry.
      const url = `${server.config.base}catalog.json`;
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== url) return next();
        try {
          const body = generate();
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(body);
        } catch (e) {
          res.statusCode = 500;
          res.end(e instanceof Error ? e.message : String(e));
        }
      });
    },
  };
}

/** Where the registry lives relative to apps/web (the folder the site is built from). */
export const defaultRegistryRoot = (webDir: string): string => join(webDir, '../..');
