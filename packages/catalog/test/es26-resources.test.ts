import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../src/consumers.ts';
import { llmsTxt, resourceExport, resourceExportToJson } from '../src/public.ts';
import {
  RESOURCE_CATEGORIES,
  RESOURCE_TYPES_BY_CATEGORY,
  type Catalog,
  type Resource,
} from '../src/schema.ts';
import { buildCatalog } from '../src/validate.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const reg = loadRegistry(ROOT);
const catalog: Catalog = reg.catalog;
const raw = () => structuredClone(reg.raw) as Record<string, unknown[]> & { resources: Resource[] };
const errorsOf = (r: ReturnType<typeof buildCatalog>) => (r.ok ? [] : r.errors);

describe('ES26 resource model', () => {
  it('loads every resource with a source record for provenance, and none is a skill', () => {
    expect(catalog.resources.length).toBeGreaterThan(0);
    const skillIds = new Set(catalog.skills.map((s) => s.id));
    for (const r of catalog.resources) {
      expect(
        catalog.sources.some((s) => s.id === r.source),
        r.id,
      ).toBe(true);
      expect(skillIds.has(r.id), r.id).toBe(false);
      expect(RESOURCE_TYPES_BY_CATEGORY[r.category]).toContain(r.type);
      expect(Boolean(r.mcp), r.id).toBe(r.category === 'mcp-servers');
    }
  });

  it('every category has entries and Other developer resources is separate from agent capabilities', () => {
    for (const c of RESOURCE_CATEGORIES)
      expect(
        catalog.resources.some((r) => r.category === c),
        c,
      ).toBe(true);
    const other = catalog.resources
      .filter((r) => r.category === 'developer-resources')
      .map((r) => r.id);
    expect(other).toEqual(
      expect.arrayContaining(['playcanvas-engine', 'cannon-es', 'sverchok', 'effekseer', 'twigl']),
    );
    // HyperFrames is "built for agents" upstream, so it is an agent development tool, not an Other resource.
    expect(other).not.toContain('hyperframes-framework');
    expect(catalog.resources.find((r) => r.id === 'hyperframes-framework')).toMatchObject({
      category: 'agent-dev-tools',
      type: 'framework',
    });
  });

  it('resources never count as skills and add no approval, installation or assignment', () => {
    const json = resourceExportToJson(catalog);
    for (const word of ['"assignments"', '"approved"', '"installable"', '"access"', '"release"'])
      expect(json).not.toContain(word);
    for (const r of catalog.resources)
      expect(['not-reviewed', 'notes-recorded', 'reviewed']).toContain(r.security.status);
  });

  it('rejects invalid resources at the registry boundary', () => {
    const cases: [string, (r: Resource[]) => void, RegExp][] = [
      ['unknown source', (r) => (r[0]!.source = 'nope'), /unknown source/],
      [
        'type outside category',
        (r) => (r.find((x) => x.category === 'developer-resources')!.type = 'standard'),
        /does not belong/,
      ],
      [
        'mcp on a non-MCP resource',
        (r) =>
          (r.find((x) => x.category === 'developer-resources')!.mcp = {
            deployment: 'local',
            transport: [],
            auth: 'None',
            toolScope: 'x',
            dataAccess: 'x',
          }),
        /mcp-servers only/,
      ],
      [
        'MCP without metadata',
        (r) => delete r.find((x) => x.category === 'mcp-servers')!.mcp,
        /needs "mcp" metadata/,
      ],
      ['id shared with a skill', (r) => (r[0]!.id = catalog.skills[0]!.id), /also a skill id/],
      ['unknown related skill', (r) => r[0]!.related.skills.push('no-such-skill'), /related skill/],
      [
        'notes without concerns',
        (r) => (r[0]!.security = { status: 'notes-recorded', concerns: [] }),
        /needs at least one concern/,
      ],
      ['verified without lastVerified', (r) => delete r[0]!.discovery.lastVerified, /lastVerified/],
      [
        'an "approved" security state',
        (r) => ((r[0]!.security as { status: string }).status = 'approved'),
        /security\.status/,
      ],
    ];
    for (const [name, mutate, re] of cases) {
      const input = raw();
      mutate(input.resources);
      expect(errorsOf(buildCatalog(input)).join('\n'), name).toMatch(re);
    }
  });
});

describe('ES26 sources', () => {
  it('records one source per repository: no two sources share an upstream', () => {
    const urls = catalog.sources.flatMap((s) => (s.upstream ? [s.upstream.url.toLowerCase()] : []));
    expect(new Set(urls).size).toBe(urls.length);
    const input = raw();
    const sources = input.sources as { id: string; upstream?: { url: string } }[];
    sources.push({
      ...structuredClone(sources.find((s) => s.id === 'playcanvas-engine')!),
      id: 'playcanvas-copy',
    });
    expect(errorsOf(buildCatalog(input)).join('\n')).toMatch(/one source per repository/);
  });

  it('a repository can provide several separately classified items without being duplicated', () => {
    const fromHyperframes = catalog.resources.filter((r) => r.source === 'heygen-hyperframes');
    expect(fromHyperframes.map((r) => r.category).sort()).toEqual([
      'agent-dev-tools', // the framework ("built for agents" upstream)
      'mcp-servers', // HeyGen's hosted connector
    ]);
    expect(
      catalog.sources.filter(
        (s) => s.upstream?.url === 'https://github.com/heygen-com/hyperframes',
      ),
    ).toHaveLength(1);
  });

  it('the ES16 Anti-slop lead is resolved in place: same id, now verified, six unapproved candidates', () => {
    const a = catalog.sources.find((s) => s.id === 'anti-slop-unresolved')!;
    expect(a).toMatchObject({
      resolution: 'verified',
      decision: 'register-with-warnings',
      upstream: { url: 'https://github.com/miqdadbadjuber/anti-slop' },
    });
    expect(a.skills).toHaveLength(6);
    expect(a.needs).toBeUndefined();
  });
});

describe('ES26 discoveries keep the skill lifecycle isolated', () => {
  const es26 = catalog.skills.filter((s) => s.discovery?.discoveredAt === '2026-11-08');
  it('registers exactly the 15 verified skill candidates, audited in ES27 but unapproved, unassigned and without releases', () => {
    expect(es26.map((s) => s.id).sort()).toEqual(
      [
        'ae-editable-project',
        'antislop',
        'antislop-code',
        'antislop-copywriting',
        'antislop-human',
        'antislop-layoutmobile',
        'antislop-ui',
        'appllama-app-design-skill',
        'appllama-usage',
        'bots',
        'directing-stickman-videos',
        'fact-checker',
        'gbro-collage-broll',
        'onetake',
        'stack-architect',
      ].sort(),
    );
    for (const s of es26) {
      // ES27 recorded a security audit (findings, no decision); nothing was approved.
      expect(s.review.status, s.id).toBe('reviewed');
      expect(s.review.audit?.round, s.id).toBe('ES27');
      expect(s.review.approvedBy, s.id).toBeUndefined();
      expect(s.source.type === 'external' && /^[0-9a-f]{40}$/.test(s.source.revision), s.id).toBe(
        true,
      );
      expect(
        catalog.consumers.some((c) => c.assignments.some((a) => a.skill === s.id)),
        s.id,
      ).toBe(false);
      expect(
        catalog.releases.some((r) => r.skill === s.id),
        s.id,
      ).toBe(false);
    }
  });

  it('the approved set is unchanged by ES26', () => {
    // ES26 itself approved nothing: the set is the six ES6/ES11.2 skills plus the four owner-authorized for Xpenz
    // on 2026-11-09 (M0.6 onboarding). An exact list, so any other approval still fails this test.
    expect(
      catalog.skills
        .filter((s) => s.review.status === 'approved')
        .map((s) => s.id)
        .sort(),
    ).toEqual(
      [
        'caveman',
        'frontend-design',
        'grilling',
        'ponytail',
        'threejs-asset-pipeline',
        'threejs-lighting',
        'threejs-loaders',
        'threejs-react-three-fiber',
        'verification-before-completion',
        'writing-plans',
      ].sort(),
    );
  });

  it('toolkits and large collections are catalogued without registering their skills', () => {
    for (const id of [
      'google-skills',
      'garrytan-gstack',
      'donchitos-claude-code-game-studios',
      'github-spec-kit',
      'gosom-google-maps-scraper',
    ]) {
      const s = catalog.sources.find((x) => x.id === id)!;
      expect(s.decision, id).toBe('reference-only');
      expect(s.skills, id).toEqual([]);
    }
    expect(catalog.sources.find((x) => x.id === 'google-skills')!.skillsFound).toBe(187);
  });

  it('a noncommercial licence is an approval blocker', () => {
    const onetake = catalog.skills.find((s) => s.id === 'onetake')!;
    expect(onetake.license).toBe('PolyForm-Noncommercial-1.0.0');
    expect(onetake.discovery?.approvalBlockers.join(' ')).toMatch(/Noncommercial/);
  });
});

describe('ES26 AI-readable public outputs', () => {
  const llms = llmsTxt(catalog, 'https://skills.example.test');
  it('llms.txt explains every status word and links stable canonical URLs', () => {
    for (const word of [
      'Discovered:',
      'Reviewed:',
      'Approved:',
      'Installable:',
      'Installed:',
      'Verified:',
    ])
      expect(llms).toContain(word);
    expect(llms).toContain(`Counts: ${catalog.skills.length} registered skills`);
    expect(llms).toContain('https://skills.example.test/resources/playcanvas-engine');
    expect(llms).toContain('https://skills.example.test/skills/antislop');
    expect(llms).toContain('https://skills.example.test/resources.v1.json');
    for (const r of catalog.resources) expect(llms).toContain(`/resources/${r.id})`);
  });

  it('public outputs carry no local paths, credentials or private records', () => {
    const out = llms + resourceExportToJson(catalog);
    expect(out).not.toMatch(/\/(Users|home|private|var|tmp)\//);
    expect(out).not.toMatch(/\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/);
    expect(out).not.toMatch(/\bsk-[A-Za-z0-9_-]{20,}/);
    // A private record cannot reach the public catalog these files are generated from.
    const input = raw();
    (input.skills as { visibility?: string }[])[0]!.visibility = 'private';
    expect(errorsOf(buildCatalog(input)).join('\n')).toMatch(/not allowed in the public registry/);
  });

  it('the resource export is versioned, deterministic and self-contained (provenance travels with each record)', () => {
    expect(resourceExportToJson(catalog)).toBe(resourceExportToJson(loadRegistry(ROOT).catalog));
    const e = resourceExport(catalog);
    expect(e).toMatchObject({ format: 'ecosystem-skills/resources', version: 1 });
    for (const r of e.resources) {
      const src = catalog.sources.find((s) => s.id === r.provenance.source)!;
      expect(r.provenance).toMatchObject({
        upstream: src.upstream?.url ?? null,
        license: src.license ?? null,
      });
    }
    expect(JSON.parse(readFileSync(resolve(ROOT, 'registry/resources.json'), 'utf8'))).toHaveLength(
      e.resources.length,
    );
  });
});
