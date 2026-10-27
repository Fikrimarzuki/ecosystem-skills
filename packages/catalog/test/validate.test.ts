import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../src/index.ts';

const first = (over = {}) => ({
  id: 'alpha',
  name: 'Alpha',
  description: 'd',
  category: 'general',
  origin: 'first-party',
  source: { type: 'first-party', path: 'skills/shared/alpha' },
  ...over,
});
const SHA = 'a'.repeat(40);
const HASH = `sha256-${'b'.repeat(64)}`;
const extSource = (over = {}) => ({
  type: 'external',
  upstream: { url: 'https://github.com/org/repo' },
  path: 'skills/ext',
  revision: SHA,
  ...over,
});
const external = (over = {}) =>
  first({
    id: 'ext',
    origin: 'external',
    source: extSource(),
    author: 'Someone',
    license: 'unknown',
    ...over,
  });
const reviewed = (over = {}) => ({
  status: 'reviewed',
  reviewedAt: '2026-10-26',
  reviewer: 'r',
  revision: SHA,
  contentHash: HASH,
  ...over,
});
const reg = (r: Record<string, unknown[]> = {}) => ({
  skills: [],
  consumers: [],
  integrations: [],
  ...r,
});
const errors = (raw: unknown) => {
  const r = buildCatalog(raw);
  return r.ok ? [] : r.errors;
};

describe('buildCatalog', () => {
  it('accepts an empty registry', () => {
    const r = buildCatalog(reg());
    expect(r.ok).toBe(true);
  });

  it('applies defaults: unreviewed, unverified', () => {
    const r = buildCatalog(
      reg({
        skills: [first()],
        consumers: [
          {
            id: 'c',
            name: 'C',
            kind: 'project',
            assignments: [{ skill: 'alpha', agents: ['codex'] }],
          },
        ],
      }),
    );
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.catalog.skills[0]?.review.status).toBe('unreviewed');
    expect(r.catalog.consumers[0]?.assignments[0]?.verification.status).toBe('unverified');
    expect(r.catalog.consumers[0]?.assignments[0]?.install).toBe('symlink');
  });

  it('rejects duplicate ids', () => {
    expect(errors(reg({ skills: [first(), first()] }))).toContain('duplicate skills id: alpha');
  });

  it('rejects unknown fields (strict)', () => {
    expect(errors(reg({ skills: [first({ localPath: 'x' })] })).length).toBeGreaterThan(0);
  });

  it('rejects unknown skill and integration references', () => {
    const e = errors(
      reg({
        skills: [first({ requires: ['nope'] })],
        consumers: [
          {
            id: 'c',
            name: 'C',
            kind: 'project',
            assignments: [{ skill: 'ghost', agents: ['codex'] }],
          },
        ],
      }),
    );
    expect(e.join('\n')).toMatch(/unknown integration "nope"/);
    expect(e.join('\n')).toMatch(/unknown skill "ghost"/);
  });

  it('requires provenance for external skills', () => {
    const e = errors(reg({ skills: [external({ author: undefined, license: undefined })] }));
    expect(e.join('\n')).toMatch(/require "author"/);
    expect(e.join('\n')).toMatch(/require "license"/);
  });

  it('rejects invalid revisions (tags, short SHAs, missing)', () => {
    for (const revision of ['v1.2.0', 'main', 'abc1234', 'A'.repeat(40), undefined])
      expect(
        errors(reg({ skills: [external({ source: extSource({ revision }) })] })).join(),
      ).toMatch(/revision/);
  });

  it('rejects missing sources and unsafe paths', () => {
    expect(errors(reg({ skills: [external({ source: undefined })] })).length).toBeGreaterThan(0);
    expect(
      errors(reg({ skills: [external({ source: extSource({ upstream: undefined }) })] })).length,
    ).toBeGreaterThan(0);
    for (const path of [
      '../escape',
      '/abs/skill',
      'a/../b',
      'a//b',
      './a',
      'C:/x',
      'a\\b',
      undefined,
    ])
      expect(
        errors(reg({ skills: [external({ source: extSource({ path }) })] })).join(),
        String(path),
      ).toMatch(/path/);
    expect(
      errors(reg({ skills: [first({ source: { type: 'first-party', path: '../x' } })] })).join(),
    ).toMatch(/path/);
  });

  it('ties a review to the pinned revision and content hash', () => {
    expect(errors(reg({ skills: [external({ review: reviewed() })] }))).toEqual([]);
    expect(
      errors(
        reg({ skills: [external({ review: reviewed({ revision: 'c'.repeat(40) }) })] }),
      ).join(),
    ).toMatch(/re-review/);
    expect(
      errors(reg({ skills: [external({ review: reviewed({ contentHash: undefined }) })] })).join(),
    ).toMatch(/contentHash/);
    expect(
      errors(reg({ skills: [external({ review: reviewed({ reviewer: undefined }) })] })).join(),
    ).toMatch(/reviewer/);
  });

  it('never accepts an approval without an explicit approver', () => {
    const e = errors(reg({ skills: [external({ review: reviewed({ status: 'approved' }) })] }));
    expect(e.join()).toMatch(/approvedBy/);
    expect(
      errors(
        reg({
          skills: [external({ review: reviewed({ status: 'approved', approvedBy: 'owner' }) })],
        }),
      ),
    ).toEqual([]);
    expect(
      errors(reg({ skills: [external({ review: reviewed({ approvedBy: 'owner' }) })] })).join(),
    ).toMatch(/only allowed/);
  });

  it('checks skill dependencies', () => {
    expect(errors(reg({ skills: [external({ requiresSkills: ['ghost'] })] })).join()).toMatch(
      /unknown skill "ghost"/,
    );
    const dep = external({ id: 'dep', review: reviewed() });
    const parent = external({
      requiresSkills: ['dep'],
      review: reviewed({ status: 'approved', approvedBy: 'owner' }),
    });
    expect(errors(reg({ skills: [dep, parent] })).join()).toMatch(
      /required skill "dep" is reviewed/,
    );
  });

  it('requires the verified revision for external assignments', () => {
    const consumer = (verification: object) => ({
      id: 'c',
      name: 'C',
      kind: 'project',
      assignments: [{ skill: 'ext', agents: ['codex'], verification }],
    });
    const v = { status: 'verified', verifiedAt: '2026-10-26', method: 'm' };
    expect(errors(reg({ skills: [external()], consumers: [consumer(v)] })).join()).toMatch(
      /requires "revision"/,
    );
    expect(
      errors(reg({ skills: [external()], consumers: [consumer({ ...v, revision: SHA })] })),
    ).toEqual([]);
    const withHash = (contentHash: string) =>
      errors(
        reg({ skills: [external()], consumers: [consumer({ ...v, revision: SHA, contentHash })] }),
      );
    expect(withHash(HASH)).toEqual([]);
    expect(withHash('abc').join()).toMatch(/sha256-/);
  });

  it('validates agent evidence records', () => {
    const ev = (over = {}) => ({
      id: 'ev-1',
      skill: 'ext',
      agent: 'codex',
      agentVersion: '1.0.0',
      date: '2026-10-26',
      context: 'pilot',
      revision: SHA,
      contentHash: HASH,
      task: 't',
      discovery: 'pass',
      instructions: 'pass',
      invocation: 'pass',
      result: 'verified',
      ...over,
    });
    expect(errors(reg({ skills: [external()], evidence: [ev()] }))).toEqual([]);
    expect(
      errors(reg({ skills: [external()], evidence: [ev({ skill: 'ghost' })] })).join(),
    ).toMatch(/unknown skill/);
    expect(
      errors(reg({ skills: [external()], evidence: [ev({ revision: undefined })] })).join(),
    ).toMatch(/requires "revision"/);
    expect(
      errors(reg({ skills: [external()], evidence: [ev({ invocation: 'not-tested' })] })).join(),
    ).toMatch(/all pass/);
    expect(
      errors(
        reg({ skills: [external()], evidence: [ev({ result: 'partial', discovery: 'fail' })] }),
      ).join(),
    ).toMatch(/partial/);
    expect(errors(reg({ skills: [external()], evidence: [ev(), ev()] })).join()).toMatch(
      /duplicate evidence id/,
    );
    expect(
      errors(reg({ skills: [external()], evidence: [ev({ trigger: 'natural', control: 'c' })] })),
    ).toEqual([]);
    expect(
      errors(reg({ skills: [external()], evidence: [ev({ trigger: 'sometimes' })] })).length,
    ).toBeGreaterThan(0);
    expect(
      errors(
        reg({ skills: [external()], evidence: [ev({ context: 'ran in /Users/me/tmp' })] }),
      ).join(),
    ).toMatch(/local path/);
    expect(
      errors(
        reg({ skills: [external()], evidence: [ev({ result: 'partial', invocation: 'fail' })] }),
      ),
    ).toEqual([]);
  });

  it('allows unknown discovery for a natural run only when the same skill, agent and revision shows it elsewhere', () => {
    const rec = (over = {}) => ({
      id: 'r1',
      skill: 'ext',
      agent: 'codex',
      agentVersion: '1',
      date: '2026-10-27',
      context: 'c',
      revision: SHA,
      contentHash: HASH,
      task: 't',
      discovery: 'pass',
      instructions: 'pass',
      invocation: 'pass',
      result: 'verified',
      ...over,
    });
    const natural = rec({
      id: 'r2',
      trigger: 'natural',
      discovery: 'not-tested',
      instructions: 'not-tested',
      invocation: 'fail',
      result: 'partial',
    });
    const ok = errors(reg({ skills: [external()], evidence: [rec(), natural] }));
    expect(ok).toEqual([]);
    // no supporting record, different agent, different revision, or an explicit record: still refused
    expect(errors(reg({ skills: [external()], evidence: [natural] })).join()).toMatch(
      /requires discovery to pass/,
    );
    expect(
      errors(
        reg({ skills: [external()], evidence: [rec({ agent: 'claude-code' }), natural] }),
      ).join(),
    ).toMatch(/requires discovery/);
    expect(
      errors(
        reg({ skills: [external()], evidence: [rec({ revision: 'e'.repeat(40) }), natural] }),
      ).join(),
    ).toMatch(/requires discovery/);
    expect(
      errors(
        reg({ skills: [external()], evidence: [rec(), { ...natural, trigger: undefined }] }),
      ).join(),
    ).toMatch(/requires discovery/);
  });

  it('validates natural-trigger trial counts', () => {
    const tally = (over = {}) => ({
      runs: 2,
      passed: 1,
      partial: 1,
      failed: 0,
      inconclusive: 0,
      ...over,
    });
    const ev = (trials: unknown, over = {}) => ({
      id: 'ev-1',
      skill: 'ext',
      agent: 'codex',
      agentVersion: '1',
      date: '2026-10-26',
      context: 'c',
      revision: SHA,
      contentHash: HASH,
      task: 't',
      trigger: 'natural',
      discovery: 'pass',
      instructions: 'pass',
      invocation: 'fail',
      result: 'partial',
      trials,
      ...over,
    });
    const ok = { treatment: { ...tally(), invoked: 1 }, control: tally() };
    expect(errors(reg({ skills: [external()], evidence: [ev(ok)] }))).toEqual([]);
    const bad = (t: unknown, over = {}) =>
      errors(reg({ skills: [external()], evidence: [ev(t, over)] })).join();
    expect(bad({ treatment: { ...tally({ passed: 3 }), invoked: 1 } })).toMatch(/do not add up/);
    expect(bad({ treatment: { ...tally(), invoked: 5 } })).toMatch(/invoked exceeds runs/);
    expect(bad({ ...ok, control: { ...tally(), invoked: 1 } })).not.toBe(''); // controls cannot carry invocations
    expect(bad({ ...ok, control: tally({ failed: 4 }) })).toMatch(/control outcome counts/);
    expect(bad(ok, { trigger: 'explicit' })).toMatch(/only meaningful for natural/);
    expect(
      bad({ treatment: { ...tally(), invoked: 1 } }, { result: 'verified', invocation: 'pass' }),
    ).toMatch(/every treatment run/);
  });

  it('rejects origin/source mismatch and fork equal to upstream', () => {
    expect(errors(reg({ skills: [first({ origin: 'external' })] })).join()).toMatch(
      /does not match/,
    );
    const url = 'https://github.com/org/repo';
    const e = errors(reg({ skills: [external({ source: extSource({ fork: { url } }) })] }));
    expect(e.join()).toMatch(/fork url must differ/);
  });

  it('refuses "verified" without evidence', () => {
    const e = errors(
      reg({
        skills: [first()],
        consumers: [
          {
            id: 'c',
            name: 'C',
            kind: 'project',
            assignments: [
              { skill: 'alpha', agents: ['codex'], verification: { status: 'verified' } },
            ],
          },
        ],
      }),
    );
    expect(e.join()).toMatch(/requires "verifiedAt" and "method"/);
  });

  it('blocks local paths and secrets', () => {
    expect(errors(reg({ skills: [first({ description: 'see /Users/me/x' })] })).join()).toMatch(
      /local path/,
    );
    expect(
      errors(reg({ skills: [first({ description: 'ghp_' + 'a'.repeat(30) })] })).join(),
    ).toMatch(/token/);
  });

  it('is deterministic regardless of input order', () => {
    const a = first({ id: 'a', tags: ['z', 'b'] });
    const b = first({ id: 'b' });
    const one = buildCatalog(reg({ skills: [a, b] }));
    const two = buildCatalog(reg({ skills: [b, a] }));
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
    if (one.ok) expect(one.catalog.skills[0]?.tags).toEqual(['b', 'z']);
  });
});
