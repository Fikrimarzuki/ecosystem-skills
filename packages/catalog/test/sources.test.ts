import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../src/index.ts';
import { installSkill } from '../src/install.ts';

const SHA = 'a'.repeat(40);
const HASH = `sha256-${'b'.repeat(64)}`;
const UP = 'https://github.com/org/repo';

const skill = (
  over: Record<string, unknown> = {},
  discovery: Record<string, unknown> | null = {},
) => ({
  id: 'cand',
  name: 'Cand',
  description: 'd',
  category: 'general',
  origin: 'external',
  source: { type: 'external', upstream: { url: UP }, path: 'skills/cand', revision: SHA },
  author: 'Org',
  license: 'MIT',
  ...(discovery === null
    ? {}
    : {
        discovery: {
          discoveredAt: '2026-10-30',
          outcome: 'register-for-review',
          source: 'org-repo',
          contentHash: HASH,
          audit: 'metadata scan only',
          ...discovery,
        },
      }),
  ...over,
});
const source = (over: Record<string, unknown> = {}) => ({
  id: 'org-repo',
  name: 'Org repo',
  batch: 'discovered',
  kind: 'skill-collection',
  resolution: 'verified',
  decision: 'register-for-review',
  upstream: { url: UP },
  revision: SHA,
  skills: ['cand'],
  summary: 's',
  discoveredAt: '2026-10-30',
  ...over,
});
const reg = (skills: unknown[], sources: unknown[]) => ({
  skills,
  consumers: [],
  integrations: [],
  sources,
});
const errors = (raw: unknown) => {
  const r = buildCatalog(raw);
  return r.ok ? [] : r.errors;
};

describe('sources and discovery records', () => {
  it('accepts a discovered, unreviewed candidate with its source and keeps it unapproved', () => {
    const r = buildCatalog(reg([skill()], [source()]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.catalog.skills[0]!.review.status).toBe('unreviewed');
      expect(r.catalog.sources).toHaveLength(1);
    }
  });

  it('defaults to no sources, so older registries stay valid', () => {
    expect(buildCatalog({ skills: [], consumers: [], integrations: [] }).ok).toBe(true);
  });

  it('accepts reference-only and unresolved sources that register nothing', () => {
    const ref = source({
      id: 'ref',
      kind: 'design-reference',
      decision: 'reference-only',
      skills: [],
    });
    const lead = source({
      id: 'lead',
      kind: 'lead',
      resolution: 'unresolved',
      decision: 'unresolved',
      upstream: undefined,
      revision: undefined,
      skills: [],
      needs: 'the exact repository URL',
    });
    expect(errors(reg([], [ref, lead]))).toEqual([]);
  });

  it('rejects an unresolved source that carries a pin or lacks "needs"', () => {
    const bad = source({ id: 'bad', resolution: 'unresolved', decision: 'unresolved', skills: [] });
    const e = errors(reg([], [bad])).join('\n');
    expect(e).toMatch(/must not carry a "revision"/);
    expect(e).toMatch(/what information would resolve it/);
  });

  it('refuses to register skills from a source that is only a reference or unresolved', () => {
    const e = errors(reg([skill()], [source({ decision: 'reference-only' })])).join('\n');
    expect(e).toMatch(/cannot list registered skills/);
    expect(errors(reg([], [source({ skills: [] })])).join('\n')).toMatch(
      /requires at least one registered skill/,
    );
  });

  it('requires upstream on a verified source, and a revision when it registers skills', () => {
    const noUp = errors(
      reg([], [source({ decision: 'reference-only', skills: [], upstream: undefined })]),
    );
    expect(noUp.join('\n')).toMatch(/verified source requires "upstream"/);
    const noRev = errors(reg([skill()], [source({ revision: undefined })]));
    expect(noRev.join('\n')).toMatch(/requires the pinned "revision"/);
    // a hosted reference (no repository) may be verified without a revision
    expect(
      errors(reg([], [source({ decision: 'reference-only', skills: [], revision: undefined })])),
    ).toEqual([]);
  });

  it('keeps skill and source consistent in both directions', () => {
    expect(
      errors(reg([skill()], [source({ skills: [], decision: 'reference-only' })])).join('\n'),
    ).toMatch(/does not list this skill/);
    expect(errors(reg([skill({}, { source: 'nope' })], [source()])).join('\n')).toMatch(
      /unknown source "nope"/,
    );
    const other = source({ upstream: { url: 'https://github.com/other/repo' } });
    expect(errors(reg([skill()], [other])).join('\n')).toMatch(/does not come from/);
  });

  it('requires warnings when the outcome says so, and a with-warnings source decision', () => {
    const w = skill({}, { outcome: 'register-with-warnings' });
    expect(errors(reg([w], [source({ decision: 'register-with-warnings' })])).join('\n')).toMatch(
      /requires at least one warning/,
    );
    const w2 = skill({}, { outcome: 'register-with-warnings', warnings: ['downloads a binary'] });
    expect(errors(reg([w2], [source()])).join('\n')).toMatch(/must be register-with-warnings/);
    expect(errors(reg([w2], [source({ decision: 'register-with-warnings' })]))).toEqual([]);
  });

  it('allows an external skill folder of "." but never a first-party one', () => {
    const root = skill({
      source: { type: 'external', upstream: { url: UP }, path: '.', revision: SHA },
    });
    expect(errors(reg([root], [source()]))).toEqual([]);
    const fp = {
      id: 'fp',
      name: 'Fp',
      description: 'd',
      category: 'general',
      origin: 'first-party',
      source: { type: 'first-party', path: '.' },
    };
    expect(errors(reg([fp], [])).join('\n')).toMatch(/relative path/);
  });

  it('refuses to install a root-level skill with a clear message', async () => {
    const s = {
      type: 'external' as const,
      upstream: { url: UP },
      path: '.',
      revision: SHA,
    };
    const { fetchSkill } = await import('../src/install.ts');
    await expect(
      fetchSkill(s, '/nonexistent-staging', (() => {
        throw new Error('must not fetch');
      }) as never),
    ).rejects.toThrow(/repository root/);
    expect(typeof installSkill).toBe('function');
  });

  it('rejects local paths in source text, as for every other record', () => {
    const e = errors(
      reg([], [source({ decision: 'reference-only', skills: [], summary: 'see /Users/x/y' })]),
    );
    expect(e.join('\n')).toMatch(/absolute local path/);
  });
});
