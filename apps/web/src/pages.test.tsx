import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildCatalog, type Catalog } from '@ecosystem-skills/catalog';
import { Page } from './App.tsx';
import { parseRoute, type Route } from './lib.ts';

const empty: Catalog = {
  schemaVersion: 1,
  skills: [],
  consumers: [],
  integrations: [],
  evidence: [],
};

const sample = buildCatalog({
  skills: [
    {
      id: 'demo',
      name: 'Demo',
      description: 'A demo skill',
      category: 'general',
      origin: 'first-party',
      source: { type: 'first-party', path: 'skills/shared/demo' },
    },
  ],
  consumers: [
    { id: 'c', name: 'C', kind: 'project', assignments: [{ skill: 'demo', agents: ['codex'] }] },
  ],
  integrations: [],
});

const SHA = 'c'.repeat(40);
const external = buildCatalog({
  skills: [
    {
      id: 'ext',
      name: 'Ext Skill',
      description: 'External candidate',
      category: 'planning',
      origin: 'external',
      source: {
        type: 'external',
        upstream: { url: 'https://github.com/org/repo' },
        path: 'skills/ext',
        revision: SHA,
      },
      author: 'org',
      license: 'MIT',
      review: {
        status: 'reviewed',
        reviewedAt: '2026-10-26',
        reviewer: 'r',
        revision: SHA,
        contentHash: `sha256-${'d'.repeat(64)}`,
        findings: ['Instruction-only.'],
      },
    },
  ],
  consumers: [
    {
      id: 'c',
      name: 'C',
      kind: 'project',
      agents: ['codex'],
      assignments: [
        {
          skill: 'ext',
          agents: ['codex'],
          verification: {
            status: 'verified',
            verifiedAt: '2026-10-01',
            method: 'm',
            revision: 'e'.repeat(40),
          },
        },
      ],
    },
  ],
  integrations: [],
  evidence: [
    {
      id: 'ev-ext-codex',
      skill: 'ext',
      agent: 'codex',
      agentVersion: '0.1.0',
      date: '2026-10-26',
      context: 'pilot',
      revision: SHA,
      contentHash: `sha256-${'d'.repeat(64)}`,
      task: 'Harmless task.',
      discovery: 'pass',
      instructions: 'pass',
      invocation: 'pass',
      result: 'verified',
    },
    {
      id: 'ev-ext-claude-old',
      skill: 'ext',
      agent: 'claude-code',
      agentVersion: '0.0.1',
      date: '2026-09-01',
      context: 'pilot',
      revision: 'f'.repeat(40),
      contentHash: `sha256-${'d'.repeat(64)}`,
      task: 'Older run.',
      discovery: 'pass',
      instructions: 'pass',
      invocation: 'pass',
      result: 'verified',
    },
  ],
});

const routes: Route[] = [
  { page: 'dashboard' },
  { page: 'skills' },
  { page: 'skill', id: 'missing' },
  { page: 'consumers' },
  { page: 'integrations' },
];

describe('pages', () => {
  it.each(routes)('render with an empty catalog: $page', (route) => {
    expect(() => renderToString(<Page route={route} catalog={empty} />)).not.toThrow();
  });

  it('shows assigned-but-unverified state, not installation', () => {
    if (!sample.ok) throw new Error('sample invalid');
    const html = renderToString(<Page route={{ page: 'consumers' }} catalog={sample.catalog} />);
    expect(html).toContain('unverified');
    expect(html).not.toContain('installed');
  });

  it('labels external skills as candidates and shows provenance and findings', () => {
    if (!external.ok) throw new Error(external.errors.join());
    const list = renderToString(<Page route={{ page: 'skills' }} catalog={external.catalog} />);
    expect(list).toContain('Candidate · reviewed');
    const detail = renderToString(
      <Page route={{ page: 'skill', id: 'ext' }} catalog={external.catalog} />,
    );
    expect(detail).toContain(`https://github.com/org/repo/tree/${SHA}/skills/ext`);
    expect(detail).toContain('Instruction-only.');
    expect(detail).toContain('Not part of the public catalog');
    expect(detail).not.toMatch(/\/Users\/|external\/skills\//);
  });

  it('shows agent evidence, badges only current verified agents, flags stale runs', () => {
    if (!external.ok) throw new Error(external.errors.join());
    const list = renderToString(<Page route={{ page: 'skills' }} catalog={external.catalog} />);
    expect(list).toMatch(/verified · (<!-- -->)?codex/);
    expect(list).not.toMatch(/verified · (<!-- -->)?claude-code/); // stale revision
    const detail = renderToString(
      <Page route={{ page: 'skill', id: 'ext' }} catalog={external.catalog} />,
    );
    expect(detail).toContain('Agent evidence');
    expect(detail).toContain('Harmless task.');
    expect(detail).toContain('explicit');
    expect(detail).toContain('stale: revision changed');
  });

  it('flags verifications made against an older revision as stale', () => {
    if (!external.ok) throw new Error(external.errors.join());
    const html = renderToString(<Page route={{ page: 'consumers' }} catalog={external.catalog} />);
    expect(html).toContain('stale: revision changed');
  });

  it('summarises natural-trigger trials and per-agent consumer evidence without a verified claim', () => {
    const base = external.ok ? external.catalog : undefined;
    if (!base) throw new Error('sample invalid');
    const trials = {
      treatment: { runs: 2, invoked: 0, passed: 2, partial: 0, failed: 0, inconclusive: 0 },
      control: { runs: 2, passed: 1, partial: 1, failed: 0, inconclusive: 0 },
    };
    const catalog = {
      ...base,
      evidence: [
        ...base.evidence,
        {
          ...base.evidence.find((e) => e.agent === 'codex')!,
          id: 'es8-ext-codex-g1',
          trigger: 'natural' as const,
          scenario: 'g1',
          trials,
          result: 'partial' as const,
          invocation: 'fail' as const,
        },
      ],
    };
    const detail = renderToString(<Page route={{ page: 'skill', id: 'ext' }} catalog={catalog} />);
    expect(detail).toMatch(/invoked (<!-- -->)?0(<!-- -->)?\/(<!-- -->)?2/);
    expect(detail).toContain('control behavior');
    const consumers = renderToString(<Page route={{ page: 'consumers' }} catalog={catalog} />);
    expect(consumers).toMatch(/natural[\s\S]{0,30}0\/2 runs invoked/);
  });

  it('parses hash routes', () => {
    expect(parseRoute('#/skills/a%20b')).toEqual({ page: 'skill', id: 'a b' });
    expect(parseRoute('')).toEqual({ page: 'dashboard' });
  });
});
