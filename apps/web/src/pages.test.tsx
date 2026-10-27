import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildCatalog, type Catalog } from '@ecosystem-skills/catalog';
import { App, Page } from './App.tsx';
import {
  agentOverview,
  agentStatus,
  consumersOf,
  evidenceFor,
  explainEmpty,
  filterSkills,
  groupOf,
  GROUP_OF_CATEGORY,
  lifecycle,
  parseRoute,
  recentEvidence,
  skillsHref,
  verifiedAgents,
  type Route,
} from './lib.ts';

const SHA = 'c'.repeat(40);
const HASH = `sha256-${'d'.repeat(64)}`;
const empty: Catalog = {
  schemaVersion: 1,
  skills: [],
  consumers: [],
  integrations: [],
  evidence: [],
};

const skill = (over: object) => ({
  name: 'S',
  description: 'desc',
  category: 'general',
  origin: 'external',
  author: 'org',
  license: 'MIT',
  ...over,
});
const ext = (id: string, name: string, review: object, extra: object = {}) =>
  skill({
    id,
    name,
    description: `${name} description`,
    source: {
      type: 'external',
      upstream: { url: `https://github.com/org/${id}` },
      path: `skills/${id}`,
      revision: SHA,
    },
    review: {
      reviewedAt: '2026-10-26',
      reviewer: 'r',
      revision: SHA,
      contentHash: HASH,
      findings: ['Instruction-only.'],
      ...review,
    },
    ...extra,
  });
const ev = (over: object) => ({
  id: 'e',
  skill: 'alpha',
  agent: 'claude-code',
  agentVersion: '1.0',
  date: '2026-10-26',
  context: 'pilot',
  revision: SHA,
  contentHash: HASH,
  task: 'Harmless task.',
  discovery: 'pass',
  instructions: 'pass',
  invocation: 'pass',
  result: 'verified',
  ...over,
});
const trials = {
  treatment: { runs: 4, invoked: 1, passed: 3, partial: 1, failed: 0, inconclusive: 0 },
  control: { runs: 4, passed: 2, partial: 2, failed: 0, inconclusive: 0 },
};

const built = buildCatalog({
  skills: [
    ext(
      'alpha',
      'Alpha Planner',
      { status: 'approved', approvedBy: 'owner' },
      { category: 'planning', tags: ['plan'] },
    ),
    ext('beta', 'Beta Reviewer', { status: 'reviewed' }, { category: 'review' }),
    skill({
      id: 'gamma',
      name: 'Gamma Local',
      origin: 'first-party',
      category: 'tooling',
      source: { type: 'first-party', path: 'skills/shared/gamma' },
      agents: ['claude-code'],
    }),
  ],
  consumers: [
    {
      id: 'proj',
      name: 'Project One',
      kind: 'project',
      agents: ['claude-code', 'codex'],
      assignments: [
        {
          skill: 'alpha',
          agents: ['claude-code', 'codex'],
          verification: { status: 'unverified', method: 'Partial notes here.' },
        },
        {
          skill: 'gamma',
          agents: ['claude-code'],
          verification: {
            status: 'verified',
            verifiedAt: '2026-10-26',
            method: 'Checked by hand.',
          },
        },
      ],
    },
    { id: 'idle', name: 'Idle Project', kind: 'project' },
  ],
  integrations: [],
  evidence: [
    ev({ id: 'e1', agent: 'claude-code', result: 'verified' }), // explicit, verified
    ev({
      id: 'e2',
      agent: 'claude-code',
      trigger: 'natural',
      scenario: 'g1',
      trials,
      invocation: 'fail',
      result: 'partial',
    }),
    ev({ id: 'e3', agent: 'codex', revision: 'f'.repeat(40), result: 'verified' }), // stale revision
  ],
});
if (!built.ok) throw new Error(built.errors.join('\n'));
const catalog = built.catalog;
const html = (route: Route, c: Catalog = catalog) =>
  renderToString(<Page route={route} catalog={c} />);
const text = (s: string) =>
  s
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

const routes: Route[] = [
  { page: 'home' },
  { page: 'dashboard' },
  { page: 'skills' },
  { page: 'skill', id: 'missing' },
  { page: 'consumers' },
  { page: 'integrations' },
];

describe('empty and loading states', () => {
  it.each(routes)('render with an empty catalog: $page', (route) => {
    expect(() => html(route, empty)).not.toThrow();
  });
  it('the app shell renders before the catalog loads', () => {
    // No window in the node test env: the shell only needs document for the theme toggle initial state.
    const g = globalThis as { document?: unknown; location?: unknown };
    g.document = { documentElement: { classList: { contains: () => false, toggle() {} } } };
    g.location = { pathname: '/skills', search: '', hash: '' };
    const out = renderToString(<App />);
    expect(out).toContain('Skip to content');
    expect(out).toContain('Loading catalog');
    delete g.document;
    delete g.location;
  });
});

describe('navigation', () => {
  it('parses clean routes, ids and filter queries', () => {
    expect(parseRoute('/skills/a%20b')).toEqual({ page: 'skill', id: 'a b' });
    expect(parseRoute('')).toEqual({ page: 'home' }); // the landing page
    expect(parseRoute('/')).toEqual({ page: 'home' });
    expect(parseRoute('/unknown')).toEqual({ page: 'notfound', path: '/unknown' });
    expect(parseRoute('/overview')).toEqual({ page: 'dashboard' }); // the dashboard moved here
    expect(parseRoute('/skills')).toEqual({ page: 'skills' });
    expect(parseRoute('/skills?status=approved&origin=external')).toEqual({
      page: 'skills',
      query: { status: 'approved', origin: 'external' },
    });
    expect(skillsHref({ status: 'approved' })).toBe('/skills?status=approved');
  });
});

describe('search and filtering', () => {
  const ids = (f: object) => filterSkills(catalog, f).map((s) => s.id);
  it('combines text, category, source, status and verified-agent filters', () => {
    expect(ids({})).toEqual(['alpha', 'beta', 'gamma']); // sorted by name
    expect(ids({ q: 'planner' })).toEqual(['alpha']);
    expect(ids({ q: 'plan' })).toEqual(['alpha']); // tag
    expect(ids({ group: 'Planning' })).toEqual(['alpha']);
    expect(ids({ group: 'Other' })).toEqual(['beta']); // unmapped category: never silently guessed
    expect(ids({ group: 'Verification' })).toEqual(['gamma']);
    expect(ids({ q: 'verification' })).toEqual(['gamma']); // the group name is searchable too
    expect(ids({ origin: 'first-party' })).toEqual(['gamma']);
    expect(ids({ status: 'approved' })).toEqual(['alpha']);
    expect(ids({ status: 'reviewed' })).toEqual(['beta']);
    expect(ids({ agent: 'claude-code' })).toEqual(['alpha']);
    expect(ids({ agent: 'codex' })).toEqual([]); // codex evidence is stale
    expect(ids({ q: 'nothing matches this' })).toEqual([]);
  });
  it('every filter narrows the others (AND, never OR)', () => {
    expect(ids({ group: 'Planning', status: 'approved' })).toEqual(['alpha']);
    expect(ids({ group: 'Planning', status: 'reviewed' })).toEqual([]);
    expect(ids({ origin: 'external', status: 'reviewed', q: 'beta' })).toEqual(['beta']);
    expect(ids({ origin: 'external', status: 'reviewed', q: 'alpha' })).toEqual([]);
    expect(ids({ origin: 'external', agent: 'any' })).toEqual(['alpha']);
    expect(ids({ origin: 'external', agent: 'none' })).toEqual(['beta']);
    expect(ids({ agent: 'none' })).toEqual(['beta', 'gamma']);
    expect(ids({ status: 'approved', origin: 'first-party' })).toEqual([]); // first-party has no approval
  });
  it('explains an empty result: lists active filters and which single removal brings results back', () => {
    const e = explainEmpty(catalog, { status: 'approved', origin: 'first-party' });
    expect(e.active.map((a) => a.label)).toEqual(['Source First-party', 'Status Approved']);
    expect(e.relaxable).toEqual([
      { key: 'origin', label: 'Source First-party', count: 1 },
      { key: 'status', label: 'Status Approved', count: 1 },
    ]);
    // Removing the search alone helps; removing the status alone does not.
    const one = explainEmpty(catalog, { q: 'zzz', status: 'reviewed' });
    expect(one.relaxable.map((r) => r.key)).toEqual(['q']);
    expect(explainEmpty(catalog, { q: 'zzz', status: 'reviewed' }).relaxable[0]!.count).toBe(1);
    // A single filter that matches nothing: removing it shows everything.
    expect(explainEmpty(catalog, { q: 'zzz' }).relaxable[0]!.count).toBe(3);
  });
  it('renders the explanation and a way out on the page', () => {
    const page = text(
      html({ page: 'skills', query: { status: 'approved', origin: 'first-party' } }),
    );
    expect(page).toContain('No skills match these filters');
    expect(page).toContain('Every filter must match at once');
    expect(page).toContain('Source First-party + Status Approved');
    expect(page).toContain('Remove Status Approved to show 1 skill');
    expect(page).toContain('0 of 3 skills');
  });
  it('offers only the categories that have skills', () => {
    const page = html({ page: 'skills' });
    expect(page).toContain('<option value="Planning">Planning</option>');
    expect(page).toContain('<option value="Verification">Verification</option>');
    expect(page).toContain('<option value="Other">Other</option>');
    expect(page).not.toContain('value="Design"');
  });
  it('renders filtered state and a helpful empty result', () => {
    const page = text(html({ page: 'skills', query: { status: 'reviewed' } }));
    expect(page).toContain('Beta Reviewer');
    expect(page).not.toContain('Alpha Planner');
    expect(page).toContain('1 of 3 skills');
    expect(page).toContain('Clear filters');
    expect(text(html({ page: 'skills', query: { q: 'zzz' } }))).toContain(
      'No skills match these filters',
    );
  });
});

describe('status presentation', () => {
  it('separates approval from verification on cards', () => {
    const page = text(html({ page: 'skills' }));
    expect(page).toContain('Approved');
    expect(page).toContain('Candidate · reviewed');
    expect(page).toContain('Explicit run verified on Claude Code');
    expect(page).toContain('No verified agent run');
    // No card may claim a Codex verification (the Codex record is stale); the filter option is worded differently.
    expect(page).not.toContain('verified on Codex');
    expect(page).toContain('Explicit run: Codex');
    expect(page).toContain('Third-party');
    expect(page).toContain('Assigned to 1 consumer');
    expect(page).toContain('Not assigned');
  });
});

describe('agent evidence', () => {
  it('keeps invocation and behavior separate, with controls, and ignores stale records', () => {
    const s = agentStatus(
      catalog,
      catalog.skills.find((x) => x.id === 'alpha'),
      'claude-code',
    );
    expect(s.explicit).toBe('verified');
    expect(s.natural).toEqual({ runs: 4, invoked: 1 });
    expect(s.behavior).toEqual({ runs: 4, passed: 3 });
    expect(s.control).toEqual({ runs: 4, passed: 2 });
    const codex = agentStatus(
      catalog,
      catalog.skills.find((x) => x.id === 'alpha'),
      'codex',
    );
    expect(codex.explicit).toBe('untested'); // only a stale record exists
    expect(codex.staleRecords).toBe(1);
    expect(codex.natural).toBeUndefined();
  });
  it('renders the status matrix without claiming universal compatibility', () => {
    const page = text(html({ page: 'skill', id: 'alpha' }));
    expect(page).toContain('Agent status');
    expect(page).toContain('Observed · 1 of 4 runs');
    expect(page).toContain('3 of 4 runs passed');
    expect(page).toContain('control (no skill): 2 of 4 runs passed');
    expect(page).toContain('stale: revision changed');
    expect(page).toContain('Windows and user-level (global) discovery are untested');
    expect(page).toContain('Installed locally: not part of this catalog');
  });
  it('shows an honest empty state when a skill has no runs', () => {
    expect(text(html({ page: 'skill', id: 'beta' }))).toContain('No agent runs recorded');
  });
  it('overview totals and recent evidence come only from records', () => {
    const o = agentOverview(catalog).find((a) => a.agent === 'claude-code')!;
    expect(o.natural).toEqual({ runs: 4, invoked: 1 });
    expect(agentOverview(catalog).find((a) => a.agent === 'codex')!.natural).toBeUndefined();
    expect(recentEvidence(catalog, 2)).toHaveLength(2);
    const page = text(html({ page: 'dashboard' }));
    expect(page).toContain('3'); // registered skills
    expect(page).toContain('not tested'); // codex natural triggering
  });
});

describe('consumers', () => {
  it('lists assigned consumers first, idle ones compactly, and never upgrades an unverified assignment', () => {
    const page = text(html({ page: 'consumers' }));
    expect(page).toContain('With assigned skills (1)');
    expect(page).toContain('Registered, no assignments yet (1)');
    expect(page.indexOf('Project One')).toBeLessThan(page.indexOf('Idle Project'));
    expect(page).toContain('natural trigger observed in 1 of 4 runs');
    expect(page).toMatch(/Codex\s*:\s*explicit run untested/); // stale evidence ignored
    expect(page).toContain('unverified');
    expect(page).toContain('No per-agent evidence records'); // first-party assignment without evidence
  });
  it('labels agents, install mode and verification for every assignment, and says what the site cannot see', () => {
    const page = text(html({ page: 'consumers' }));
    expect(page).toContain('2 skills');
    expect(page).toMatch(/Agents Claude Code Codex Install symlink Verification unverified/);
    expect(page).toMatch(/Agents Claude Code Install symlink Verification verified/);
    expect(page).toContain('cannot see a project’s folders');
    expect(page).toContain('pnpm skills:verify');
  });
  it('shows, on the skill page, each consumer with agents, install mode and verification', () => {
    const alpha = text(html({ page: 'skill', id: 'alpha' }));
    expect(alpha).toContain('Project One');
    expect(alpha).toMatch(/Agents Claude Code Codex Install symlink Verification unverified/);
    expect(alpha).toContain('Not verified for this consumer.');
    expect(alpha).toContain('do not show whether a project currently has the link');
    const gamma = text(html({ page: 'skill', id: 'gamma' }));
    expect(gamma).toMatch(/Verification verified/);
    expect(gamma).not.toContain('Not verified for this consumer.');
    expect(text(html({ page: 'skill', id: 'beta' }))).toContain('Not assigned to any consumer');
    expect(consumersOf(catalog, 'alpha')).toHaveLength(1);
  });
});

describe('lifecycle', () => {
  const row = (c: Catalog, id: string, key: string) =>
    lifecycle(
      c,
      c.skills.find((s) => s.id === id)!,
    ).find((r) => r.key === key)!;

  it('reports seven separate states for every skill', () => {
    for (const s of catalog.skills)
      expect(lifecycle(catalog, s).map((r) => r.key)).toEqual([
        'registered',
        'reviewed',
        'approved',
        'installed',
        'assigned',
        'activated',
        'verified',
      ]);
  });
  it('an approved, assigned, verified skill: only the registry facts are asserted', () => {
    expect(row(catalog, 'alpha', 'approved').kind).toBe('ok');
    expect(row(catalog, 'alpha', 'assigned').value).toBe('1 consumer');
    expect(row(catalog, 'alpha', 'verified').value).toBe('Explicit run on Claude Code');
    expect(row(catalog, 'alpha', 'verified').detail).toMatch(
      /Explicit use does not establish natural triggering/,
    );
    // Installation and activation are machine-local: never claimed from the registry.
    expect(row(catalog, 'alpha', 'installed').kind).toBe('unknown');
    expect(row(catalog, 'alpha', 'activated').kind).toBe('unknown');
  });
  it('a reviewed-only skill is not approved, not assigned, not verified', () => {
    expect(row(catalog, 'beta', 'reviewed').kind).toBe('ok');
    expect(row(catalog, 'beta', 'approved')).toMatchObject({ kind: 'none', value: 'No' });
    expect(row(catalog, 'beta', 'assigned').value).toBe('No consumer');
    expect(row(catalog, 'beta', 'activated').value).toBe('Not expected');
    expect(row(catalog, 'beta', 'verified')).toMatchObject({
      kind: 'none',
      value: 'No agent evidence',
    });
  });
  it('distinguishes evidence records, verified assignments and having nothing', () => {
    // gamma: no evidence records, but its assignment is verified.
    expect(row(catalog, 'gamma', 'verified')).toMatchObject({
      kind: 'ok',
      value: 'Assignment verified for Project One',
    });
    // beta with a natural-trigger record only: runs exist, none is a verified explicit run.
    const withRuns: Catalog = {
      ...catalog,
      evidence: [...catalog.evidence, { ...catalog.evidence[1]!, id: 'e9', skill: 'beta' }],
    };
    const v = row(withRuns, 'beta', 'verified');
    expect(v).toMatchObject({ kind: 'warn', value: 'No verified explicit run' });
    expect(v.detail).toMatch(
      /1 agent run\(s\) are recorded.*Natural triggering: Claude Code 1 of 4 runs/,
    );
    // beta as registered: nothing at all.
    expect(row(catalog, 'beta', 'verified').value).toBe('No agent evidence');
  });
  it('first-party skills are not shown as reviewed or approved third-party content', () => {
    expect(row(catalog, 'gamma', 'reviewed').value).toBe('Not applicable');
    expect(row(catalog, 'gamma', 'approved').value).toBe('Not applicable');
    expect(row(catalog, 'gamma', 'installed').value).toBe('Not applicable');
  });
  it('the page presents the states as separate facts with the distinctions spelled out', () => {
    const page = text(html({ page: 'skill', id: 'beta' }));
    expect(page).toContain('Lifecycle');
    expect(page).toContain('not steps in a progress bar');
    expect(page).toContain('Approved is not installed. Installed is not assigned.');
    expect(page).toContain('does not show a behavioral benefit');
    expect(html({ page: 'skill', id: 'beta' })).not.toMatch(/role="progressbar"|<progress/);
  });
});

describe('tables and responsive structure', () => {
  it('wraps every table in a labelled, focusable scroll region with a caption', () => {
    for (const route of [{ page: 'skill', id: 'alpha' }, { page: 'integrations' }] as Route[]) {
      const out = html(route);
      const tables = out.match(/<table/g)?.length ?? 0;
      expect(tables).toBeGreaterThan(0);
      expect(out.match(/role="region"/g)?.length).toBe(tables);
      expect(out.match(/tabindex="0"/g)?.length).toBe(tables);
      expect(out.match(/<caption class="sr-only">/g)?.length).toBe(tables);
    }
  });
  it('the skill library form is a 2-column grid that stacks on small screens', () => {
    expect(html({ page: 'skills' })).toContain('grid-cols-2');
  });
});

describe('public data boundaries', () => {
  const read = (n: string) =>
    JSON.parse(
      readFileSync(resolve(__dirname, '../../../registry', `${n}.json`), 'utf8'),
    ) as unknown;
  const real = buildCatalog({
    skills: read('skills'),
    consumers: read('consumers'),
    integrations: read('integrations'),
    evidence: read('evidence'),
  });
  if (!real.ok) throw new Error(real.errors.join('\n'));
  const leaks =
    /\/Users\/|\/private\/|\/home\/|C:\\|file:\/\/|external\/skills\/|[A-Za-z0-9_-]*(token|secret|password)[A-Za-z0-9_-]*\s*[:=]\s*\S{12,}|ghp_|sk-[A-Za-z0-9]{20}/i;
  it('the real catalog and every rendered page contain no local paths or secrets', () => {
    expect(JSON.stringify(real.catalog)).not.toMatch(leaks);
    const pages: Route[] = [
      { page: 'home' },
      { page: 'dashboard' },
      { page: 'skills' },
      { page: 'consumers' },
      { page: 'integrations' },
      ...real.catalog.skills.map((s) => ({ page: 'skill', id: s.id }) as Route),
    ];
    for (const r of pages) expect(html(r, real.catalog)).not.toMatch(leaks);
  });
  it('records the finalized Codex natural-trigger trials without implying an improvement', () => {
    const get = (id: string, agent: string) =>
      agentStatus(
        real.catalog,
        real.catalog.skills.find((x) => x.id === id),
        agent,
      );
    const v = get('verification-before-completion', 'codex');
    expect(v.natural).toEqual({ runs: 6, invoked: 4 });
    expect(v.behavior).toEqual({ runs: 6, passed: 6 });
    expect(v.control).toEqual({ runs: 6, passed: 6 }); // controls passed too: no improvement is shown
    const g = get('grilling', 'codex');
    expect(g.natural).toEqual({ runs: 6, invoked: 0 });
    expect(g.explicit).toBe('verified'); // explicit invocation (ES6) is a separate dimension
    expect(text(html({ page: 'skill', id: 'grilling' }, real.catalog))).toContain(
      'Not observed · 0 of 6 runs',
    );
  });
  it('every real category is deliberately placed in a browsing group (nothing falls into Other)', () => {
    for (const s of real.catalog.skills)
      if (groupOf(s) === 'Other') throw new Error(`unmapped category "${s.category}" (${s.id})`);
    for (const c of Object.keys(GROUP_OF_CATEGORY))
      expect(
        real.catalog.skills.some((s) => s.category === c),
        `unused mapping ${c}`,
      ).toBe(true);
    const g = (id: string) => groupOf(real.catalog.skills.find((s) => s.id === id)!);
    expect(g('momee-character-art')).toBe('Project-specific');
    expect(g('grilling')).toBe('Planning');
    expect(g('writing-plans')).toBe('Planning');
    expect(g('frontend-design')).toBe('Design');
    expect(g('verification-before-completion')).toBe('Verification');
    expect(g('caveman')).toBe('Communication');
    expect(g('ponytail')).toBe('Coding');
  });
  it('lifecycle never claims installation or activation, and claims verification only from evidence', () => {
    for (const s of real.catalog.skills) {
      const rows = lifecycle(real.catalog, s);
      const by = (k: string) => rows.find((r) => r.key === k)!;
      expect(by('installed').kind, s.id).not.toBe('ok');
      expect(by('activated').kind, s.id).not.toBe('ok');
      expect(by('assigned').kind === 'ok', s.id).toBe(consumersOf(real.catalog, s.id).length > 0);
      // Verified only from an explicit-run evidence record or a verified consumer assignment, never otherwise.
      const verifiedAssignment = consumersOf(real.catalog, s.id).some(
        (u) => u.assignment.verification.status === 'verified',
      );
      expect(by('verified').kind === 'ok', s.id).toBe(
        verifiedAgents(real.catalog, s).length > 0 || verifiedAssignment,
      );
    }
  });
  it('Caveman and Ponytail: approved, with no assignment and no agent evidence shown as verification', () => {
    for (const id of ['caveman', 'ponytail']) {
      const s = real.catalog.skills.find((x) => x.id === id)!;
      expect(s.review.status).toBe('approved');
      expect(evidenceFor(real.catalog, id)).toEqual([]);
      expect(consumersOf(real.catalog, id)).toEqual([]);
      const rows = lifecycle(real.catalog, s);
      const by = (k: string) => rows.find((r) => r.key === k)!;
      expect(by('approved').kind).toBe('ok');
      expect(by('assigned').value).toBe('No consumer');
      expect(by('activated').value).toBe('Not expected');
      expect(by('verified').value).toBe('No agent evidence');
      const page = text(html({ page: 'skill', id }, real.catalog));
      expect(page).toContain('Notes and limitations');
      expect(page).toContain('Not assigned to any consumer');
      expect(page).toContain('No agent runs recorded');
      expect(page).not.toMatch(/Explicit run (verified|on) /);
      expect(page).not.toMatch(/Verified on/);
      expect(page).toContain('Not tracked here'); // installation is not asserted either way
    }
    const ponytail = text(html({ page: 'skill', id: 'ponytail' }, real.catalog));
    expect(ponytail).toContain('coding behavior is unevaluated');
    expect(ponytail).toContain('does not require running tests');
    expect(ponytail).toContain('broad');
    const caveman = text(html({ page: 'skill', id: 'caveman' }, real.catalog));
    expect(caveman).toContain('explicit loading and the session-wide style change are untested');
    expect(caveman).toContain('core skills/caveman folder only');
    // Neither card claims a verified agent run.
    const cards = text(html({ page: 'skills', query: { q: 'caveman' } }, real.catalog));
    expect(cards).toContain('No verified agent run');
    expect(cards).not.toContain('Explicit run verified on');
  });
  it('first-party skills verified per assignment: the lifecycle names that source and claims nothing more', () => {
    for (const id of ['momee-character-art', 'skill-discovery-smoke-test']) {
      const s = real.catalog.skills.find((x) => x.id === id)!;
      expect(s.origin).toBe('first-party');
      expect(evidenceFor(real.catalog, id)).toEqual([]); // no per-run evidence records
      expect(
        consumersOf(real.catalog, id).some((u) => u.assignment.verification.status === 'verified'),
      ).toBe(true);
      const v = lifecycle(real.catalog, s).find((r) => r.key === 'verified')!;
      expect(v.kind).toBe('ok');
      expect(v.value).toMatch(/^Assignment verified for /);
      expect(v.detail).toMatch(/no per-run evidence records/);
      expect(v.detail).toMatch(/does not establish natural triggering.*or a behavioral benefit/);
      const page = text(html({ page: 'skill', id }, real.catalog));
      expect(page).not.toContain('No current agent run is recorded'); // the ES13.1 contradiction
      expect(page).not.toContain('No agent evidence');
      expect(page).toContain('No per-run evidence: this table only reads evidence records');
      expect(page).not.toMatch(/Explicit run (verified )?on /); // no evidence-based claim either
    }
  });
  it('every real skill page renders and every pinned revision is a full SHA', () => {
    for (const s of real.catalog.skills) {
      expect(html({ page: 'skill', id: s.id }, real.catalog)).toContain(
        s.name.replace(/&/g, '&amp;'),
      );
      if (s.source.type === 'external') expect(s.source.revision).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});
