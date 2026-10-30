import { readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../src/consumers.ts';
import { locateSource, validateMappings } from '../src/ecosystem.ts';
import { formatJson } from '../src/fsguard.ts';
import { buildCatalog } from '../src/validate.ts';
import { makeRepo, tmp, write } from './fixtures.ts';

/*
 * ES24 ecosystem integrations: Ecosystem Config and Ecosystem Assets as read-only sources, located by integration
 * identity so that a repository rename is a one-record change. All sources here are synthetic fixtures.
 */

const configIntegration = (name: string, formerNames: string[] = []) => ({
  id: 'ecosystem-config',
  name: 'Ecosystem Config',
  type: 'config-registry',
  description: 'd',
  repository: { name, formerNames, visibility: 'public', url: `https://github.com/o/${name}` },
  contract: {
    docs: ['docs/consumers/integration.md'],
    reads: ['dist/ecosystem.json'],
    commands: [],
  },
});
const assetIntegration = {
  id: 'ecosystem-assets',
  name: 'Ecosystem Assets',
  type: 'asset-catalog',
  description: 'd',
  repository: { name: 'assets-repo', formerNames: [], visibility: 'private' },
  contract: { docs: ['docs/catalog.md'], reads: ['catalog-output/internal.json'], commands: [] },
};

/** A public fixture repo inside a parent folder, with sibling source checkouts. */
function workspace(opts: { configDir?: string; integrations?: unknown[]; assets?: boolean } = {}) {
  const parent = tmp('es24-eco-');
  const { root: made, project } = makeRepo();
  const root = join(parent, 'ecosystem-skills');
  renameSync(made, root);
  const configDir = opts.configDir ?? 'config-ecosystem';
  write(join(parent, configDir, 'docs/consumers/integration.md'), '# guide\n');
  write(
    join(parent, configDir, 'dist/ecosystem.json'),
    JSON.stringify({ version: 1, projects: { playnest: {}, fmStudios: {} } }),
  );
  if (opts.assets !== false) {
    write(join(parent, 'assets-repo/docs/catalog.md'), '# catalog\n');
    write(
      join(parent, 'assets-repo/catalog-output/internal.json'),
      JSON.stringify({
        schemaVersion: 1,
        assets: [{ projectId: 'playnest' }, { projectId: 'playnest' }],
      }),
    );
  }
  write(
    join(root, 'registry/integrations.json'),
    formatJson(opts.integrations ?? [configIntegration('config-ecosystem'), assetIntegration]),
  );
  const consumers = JSON.parse(readFileSync(join(root, 'registry/consumers.json'), 'utf8'));
  consumers[0].ecosystem = {
    project: 'playnest',
    sources: ['ecosystem-config', 'ecosystem-assets'],
  };
  write(join(root, 'registry/consumers.json'), formatJson(consumers));
  return { parent, root, project };
}

describe('ES24 integration identity and rename compatibility', () => {
  it('finds the config source under its current name', () => {
    const { root, parent } = workspace();
    const i = loadRegistry(root).catalog.integrations.find((x) => x.id === 'ecosystem-config')!;
    expect(locateSource(root, i)).toMatchObject({
      path: join(parent, 'config-ecosystem'),
      matchedName: 'config-ecosystem',
      how: 'sibling',
    });
  });

  it('after a rename, updating the one integration record is enough (the old name stays resolvable)', () => {
    // the repository was renamed on disk; the registry record now says ecosystem-config, formerly config-ecosystem
    const before = workspace();
    const reg = (root: string) => loadRegistry(root).catalog;
    renameSync(join(before.parent, 'config-ecosystem'), join(before.parent, 'ecosystem-config'));
    const broken = validateMappings(before.root, reg(before.root));
    expect(broken.find((c) => c.check === 'ecosystem-config: source available')?.status).toBe(
      'warn',
    );
    write(
      join(before.root, 'registry/integrations.json'),
      formatJson([configIntegration('ecosystem-config', ['config-ecosystem']), assetIntegration]),
    );
    const after = validateMappings(before.root, reg(before.root));
    expect(after.filter((c) => c.status !== 'ok')).toEqual([]);
    // a checkout that still has the old name is found too, labelled as a former name
    const old = workspace({
      integrations: [configIntegration('ecosystem-config', ['config-ecosystem']), assetIntegration],
    });
    const found = validateMappings(old.root, reg(old.root)).find(
      (c) => c.check === 'ecosystem-config: source available',
    );
    expect(found).toMatchObject({
      status: 'ok',
      detail: 'found as config-ecosystem (a former name)',
    });
    // nothing else in the registry names the repository
    for (const f of readdirSync(join(old.root, 'registry')).filter(
      (x) => x !== 'integrations.json',
    ))
      expect(readFileSync(join(old.root, 'registry', f), 'utf8'), f).not.toMatch(
        /config-ecosystem/,
      );
  });

  it('sources.local.json overrides sibling lookup', () => {
    const { root, parent } = workspace({ configDir: 'somewhere-else' });
    writeFileSync(
      join(root, 'sources.local.json'),
      JSON.stringify({ 'ecosystem-config': '../somewhere-else' }),
    );
    const i = loadRegistry(root).catalog.integrations.find((x) => x.id === 'ecosystem-config')!;
    expect(locateSource(root, i)).toMatchObject({
      path: join(parent, 'somewhere-else'),
      how: 'sources.local.json',
    });
  });
});

describe('ES24 mapping validation against sources', () => {
  it('checks config project ids and asset records; a missing source is a warning, never a guess', () => {
    const { root } = workspace({ assets: false });
    const checks = validateMappings(root, loadRegistry(root).catalog);
    expect(checks.map((c) => `${c.status} ${c.check}`)).toEqual([
      'ok ecosystem-config: source available',
      'ok ecosystem-config: project playnest',
      'warn ecosystem-assets: source available',
    ]);
    const w = workspace();
    expect(
      validateMappings(w.root, loadRegistry(w.root).catalog).find((c) =>
        c.check.includes('assets for'),
      ),
    ).toMatchObject({
      status: 'ok',
      detail: '2 catalog record(s)',
    });
  });

  it('an unknown project id is an error', () => {
    const { root } = workspace();
    const consumers = JSON.parse(readFileSync(join(root, 'registry/consumers.json'), 'utf8'));
    consumers[0].ecosystem.project = 'noSuchProject';
    write(join(root, 'registry/consumers.json'), formatJson(consumers));
    const c = validateMappings(root, loadRegistry(root).catalog).find((x) =>
      x.check.includes('noSuchProject'),
    );
    expect(c).toMatchObject({ status: 'error', detail: 'no such project record' });
  });

  it('validation rejects broken references and ambiguous identities', () => {
    const { root } = workspace();
    const raw = loadRegistry(root).raw as Record<string, Record<string, unknown>[]>;
    const withConsumer = (ecosystem: unknown) =>
      buildCatalog({
        ...raw,
        consumers: raw.consumers!.map((c, i) => (i === 0 ? { ...c, ecosystem } : c)),
      });
    const err = (r: ReturnType<typeof buildCatalog>) => (r.ok ? '' : r.errors.join('\n'));
    expect(err(withConsumer({ sources: ['nope'] }))).toMatch(/not a registered integration/);
    expect(err(withConsumer({ project: 'playnest', sources: ['ecosystem-assets'] }))).toMatch(
      /needs a config-registry source/,
    );
    const withIntegrations = (list: unknown[]) => err(buildCatalog({ ...raw, integrations: list }));
    expect(
      withIntegrations([
        configIntegration('a'),
        { ...assetIntegration, repository: { ...assetIntegration.repository, formerNames: ['a'] } },
      ]),
    ).toMatch(/repository name "a" is also used by ecosystem-config/);
    expect(
      withIntegrations([
        configIntegration('a'),
        {
          ...assetIntegration,
          repository: { ...assetIntegration.repository, url: 'https://github.com/o/x' },
        },
      ]),
    ).toMatch(/private repository is named only/);
    expect(withIntegrations([{ ...assetIntegration, contract: undefined }])).toMatch(
      /needs "repository" and "contract"/,
    );
    expect(
      withIntegrations([
        {
          id: 'git',
          name: 'Git',
          type: 'cli-tool',
          description: 'd',
          repository: assetIntegration.repository,
        },
      ]),
    ).toMatch(/apply to asset-catalog and config-registry only/);
  });
});

describe('ES24 first-party integration skills in the real registry', () => {
  const repo = resolve(__dirname, '../../..');
  const c = loadRegistry(repo).catalog;

  it('are registered as public first-party skills that require their integration, and are not approved', () => {
    for (const id of ['ecosystem-assets', 'ecosystem-config']) {
      const s = c.skills.find((x) => x.id === id)!;
      expect(s.source).toEqual({ type: 'first-party', path: `skills/shared/${id}` });
      expect(s.requires).toEqual([id]);
      expect(s.review.status).toBe('unreviewed');
      expect(s.visibility).toBeUndefined(); // public
      const md = readFileSync(
        join(repo, s.source.type === 'first-party' ? s.source.path : '', 'SKILL.md'),
        'utf8',
      );
      expect(md).toMatch(new RegExp(`^---\\nname: ${id}\\n`));
    }
    const config = c.integrations.find((x) => x.id === 'ecosystem-config')!;
    // renamed in ES25: the current name, with the old one kept as a former name
    expect(config.repository).toMatchObject({
      name: 'ecosystem-config',
      formerNames: ['config-ecosystem'],
      visibility: 'public',
    });
    const assets = c.integrations.find((x) => x.id === 'ecosystem-assets')!;
    expect(assets.repository).toMatchObject({ name: 'ecosystem-assets', visibility: 'private' });
    expect(assets.repository!.url).toBeUndefined();
  });

  it('carry no private asset data, local paths or credentials, and no write instructions for the sources', () => {
    for (const id of ['ecosystem-assets', 'ecosystem-config']) {
      const dir = join(repo, 'skills/shared', id);
      const text = readdirSync(dir, { recursive: true })
        .map(String)
        .filter((f) => f.endsWith('.md'))
        .map((f) => readFileSync(join(dir, f), 'utf8'))
        .join('\n');
      expect(text).not.toMatch(
        /file:projects\/|file:incoming\/|\/Users\/|\/home\/|sk-[A-Za-z0-9]{20}|ghp_/,
      );
      expect(text).not.toMatch(/\bgit (push|commit)\b|npm install|pnpm add|rm -rf/);
      expect(text).toMatch(/never|Never/);
    }
  });

  it('project mappings reference only registered sources; assignments are unchanged by them', () => {
    const mapped = c.consumers
      .filter((x) => x.ecosystem)
      .map((x) => [x.id, x.ecosystem!.project ?? '-', x.ecosystem!.sources.join('+')]);
    expect(mapped).toEqual([
      ['fm-studios', 'fmStudios', 'ecosystem-config'],
      ['gateway', 'gateway', 'ecosystem-config+ecosystem-assets'],
      ['hearthside', '-', 'ecosystem-config'],
      ['momee', '-', 'ecosystem-assets'],
      ['playdeck', 'playdeck', 'ecosystem-config'],
      ['playnest', 'playnest', 'ecosystem-config'],
    ]);
  });
});
